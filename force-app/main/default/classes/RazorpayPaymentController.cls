
public with sharing class RazorpayPaymentController {

    // Response returned to the LWC
    public class RazorpayOrderResponse {
        @AuraEnabled public String razorpayOrderId;
        @AuraEnabled public String currencyCode;
        @AuraEnabled public Long amount;
        @AuraEnabled public Id paymentRecordId;
    }

    @AuraEnabled
    public static RazorpayOrderResponse createRazorpayOrder(
        Id customerOrderId
    ) {

        try {

            // 1. Validate current customer
            User currentUser = [
                SELECT ContactId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];

            if (currentUser.ContactId == null) {
                throw new AuraHandledException(
                    'Customer account is not properly configured.'
                );
            }

            // 2. Fetch only the logged-in customer's order
            List<Customer_Order__c> orders = [
                SELECT Id, Name, Customer__c,
                       Total_Amount__c, Payment_Status__c
                FROM Customer_Order__c
                WHERE Id = :customerOrderId
                AND Customer__c = :currentUser.ContactId
                WITH USER_MODE
                LIMIT 1
            ];

            if (orders.isEmpty()) {
                throw new AuraHandledException(
                    'Order not found or access denied.'
                );
            }

            Customer_Order__c customerOrder = orders[0];

            if (customerOrder.Payment_Status__c == 'Paid') {
                throw new AuraHandledException(
                    'This order has already been paid.'
                );
            }

            if (customerOrder.Total_Amount__c == null ||
                customerOrder.Total_Amount__c < 1) {
                throw new AuraHandledException(
                    'Invalid order amount.'
                );
            }

            // 3. Convert INR into paise
            Long amountInPaise =
                (Long)(customerOrder.Total_Amount__c * 100);

            // 4. Prepare Razorpay API request
            Map<String, Object> requestBody =
                new Map<String, Object>{
                    'amount' => amountInPaise,
                    'currency' => 'INR',
                    'receipt' => customerOrder.Name,
                    'notes' => new Map<String, Object>{
                        'salesforce_order_id' =>
                            String.valueOf(customerOrder.Id)
                    }
                };

            HttpRequest request = new HttpRequest();

            request.setEndpoint(
                'callout:Razorpay_API/v1/orders'
            );

            request.setMethod('POST');
            request.setHeader(
                'Content-Type',
                'application/json'
            );

            request.setTimeout(30000);

            request.setBody(
                JSON.serialize(requestBody)
            );

            // 5. Call Razorpay
            HttpResponse response = new Http().send(request);

            if (response.getStatusCode() != 200 &&
                response.getStatusCode() != 201) {

                System.debug(
                    LoggingLevel.ERROR,
                    'Razorpay API Error: ' + response.getBody()
                );

                throw new AuraHandledException(
                    'Unable to create Razorpay order. Please try again.'
                );
            }

            Map<String, Object> responseData =
                (Map<String, Object>) JSON.deserializeUntyped(
                    response.getBody()
                );

            String razorpayOrderId =
                (String) responseData.get('id');

            if (String.isBlank(razorpayOrderId)) {
                throw new AuraHandledException(
                    'Razorpay did not return an order ID.'
                );
            }

            // 6. Create Salesforce Payment record
            Payment__c payment = new Payment__c(
                Customer_Order__c = customerOrder.Id,
                Payment_Amount__c = customerOrder.Total_Amount__c,
                Payment_Status__c = 'Processing',
                Razorpay_Order_ID__c = razorpayOrderId,
                Signature_Verified__c = false
            );

            Database.insert(payment, AccessLevel.SYSTEM_MODE);

            // 7. Return response to LWC
            RazorpayOrderResponse result =
                new RazorpayOrderResponse();

            result.razorpayOrderId = razorpayOrderId;
            result.currencyCode = 'INR';
            result.amount = amountInPaise;
            result.paymentRecordId = payment.Id;

            return result;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {

    System.debug(
        LoggingLevel.ERROR,
        'Razorpay Controller Error: ' + e.getMessage()
    );

    throw new AuraHandledException(
        'Payment initiation error: ' + e.getMessage()
    );
}
    }


    
@AuraEnabled
public static Boolean verifyRazorpayPayment(
    String razorpayOrderId,
    String razorpayPaymentId
) {
    try {
        if (String.isBlank(razorpayOrderId) ||
            String.isBlank(razorpayPaymentId)) {
            throw new AuraHandledException('Invalid payment details.');
        }

        // 1. Identify the logged-in customer
        User currentUser = [
            SELECT ContactId
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        if (currentUser.ContactId == null) {
            throw new AuraHandledException('Customer not found.');
        }

        // 2. Find the customer's own Payment record
        List<Payment__c> payments = [
            SELECT Id, Customer_Order__c, Payment_Amount__c,
                   Payment_Status__c, Razorpay_Order_ID__c,
                   Razorpay_Payment_ID__c
            FROM Payment__c
            WHERE Razorpay_Order_ID__c = :razorpayOrderId
            AND Customer_Order__r.Customer__c = :currentUser.ContactId
            LIMIT 1
        ];

        if (payments.isEmpty()) {
            throw new AuraHandledException('Payment record not found.');
        }

        Payment__c payment = payments[0];

        // 3. Prevent payment reuse
        if (payment.Payment_Status__c == 'Paid') {
            if (payment.Razorpay_Payment_ID__c == razorpayPaymentId) {
                return true;
            }

            throw new AuraHandledException(
                'This order has already been paid.'
            );
        }

        if (payment.Payment_Status__c != 'Processing') {
            throw new AuraHandledException(
                'This payment is not available for verification.'
            );
        }

        // 4. Fetch actual payment details from Razorpay
        HttpRequest request = new HttpRequest();
        request.setEndpoint(
            'callout:Razorpay_API/v1/payments/' +
            EncodingUtil.urlEncode(razorpayPaymentId, 'UTF-8')
        );
        request.setMethod('GET');
        request.setTimeout(30000);

        HttpResponse response = new Http().send(request);

        if (response.getStatusCode() != 200) {
            throw new AuraHandledException(
                'Unable to verify payment with Razorpay.'
            );
        }

        Map<String, Object> paymentData =
            (Map<String, Object>) JSON.deserializeUntyped(
                response.getBody()
            );

        // 5. Validate Razorpay's actual response
        String actualOrderId =
            (String) paymentData.get('order_id');

        String actualStatus =
            (String) paymentData.get('status');

        String actualCurrency =
            (String) paymentData.get('currency');

        Decimal actualAmount =
            Decimal.valueOf(
                String.valueOf(paymentData.get('amount'))
            );

        Long expectedAmount =
            (Long)(payment.Payment_Amount__c * 100);

        if (actualStatus != 'captured' ||
            actualOrderId != payment.Razorpay_Order_ID__c ||
            actualOrderId != razorpayOrderId ||
            actualCurrency != 'INR' ||
            actualAmount != expectedAmount) {

            throw new AuraHandledException(
                'Payment verification failed. Details do not match.'
            );
        }

        // 6. Lock records before updating
        Payment__c lockedPayment = [
            SELECT Id, Payment_Status__c,
                   Razorpay_Payment_ID__c
            FROM Payment__c
            WHERE Id = :payment.Id
            FOR UPDATE
        ];

        Customer_Order__c customerOrder = [
            SELECT Id, Payment_Status__c
            FROM Customer_Order__c
            WHERE Id = :payment.Customer_Order__c
            FOR UPDATE
        ];

        // 7. Recheck after acquiring the lock
        if (lockedPayment.Payment_Status__c == 'Paid') {
            if (lockedPayment.Razorpay_Payment_ID__c ==
                razorpayPaymentId) {
                return true;
            }

            throw new AuraHandledException(
                'This order has already been paid.'
            );
        }

        if (lockedPayment.Payment_Status__c != 'Processing') {
            throw new AuraHandledException(
                'Payment status has changed. Please try again.'
            );
        }

        // 8. Update Salesforce payment and order
       // 8. Prevent another payment from deducting stock for an already-paid order
if (customerOrder.Payment_Status__c == 'Paid') {
    throw new AuraHandledException(
        'This order has already been paid.'
    );
}

// 9. Get order items and calculate required stock
List<Order_Item__c> orderItems = [
    SELECT Id, Perfume__c, Quantity__c
    FROM Order_Item__c
    WHERE Customer_Order__c = :customerOrder.Id
];

if (orderItems.isEmpty()) {
    throw new AuraHandledException(
        'No items found for this order.'
    );
}

Map<Id, Decimal> requiredStock = new Map<Id, Decimal>();

for (Order_Item__c item : orderItems) {
    if (item.Perfume__c == null ||
        item.Quantity__c == null ||
        item.Quantity__c <= 0) {
        throw new AuraHandledException(
            'Invalid product or quantity in order.'
        );
    }

    Decimal currentRequired =
        requiredStock.containsKey(item.Perfume__c)
        ? requiredStock.get(item.Perfume__c)
        : 0;

    requiredStock.put(
        item.Perfume__c,
        currentRequired + item.Quantity__c
    );
}

// 10. Lock product records before changing stock
List<Perfume__c> perfumes = [
    SELECT Id, Product_Name__c, Stock_Quantity__c
    FROM Perfume__c
    WHERE Id IN :requiredStock.keySet()
    FOR UPDATE
];

if (perfumes.size() != requiredStock.size()) {
    throw new AuraHandledException(
        'One or more products could not be found.'
    );
}

// 11. Validate and deduct stock
for (Perfume__c perfume : perfumes) {
    Decimal availableStock =
        perfume.Stock_Quantity__c == null
        ? 0
        : perfume.Stock_Quantity__c;

    Decimal requestedStock =
        requiredStock.get(perfume.Id);

    if (availableStock < requestedStock) {
        throw new AuraHandledException(
            'Insufficient stock for ' +
            perfume.Product_Name__c +
            '. Please contact support.'
        );
    }

    perfume.Stock_Quantity__c =
        availableStock - requestedStock;
}

// 12. Update inventory and payment together
update perfumes;

lockedPayment.Payment_Status__c = 'Paid';
lockedPayment.Razorpay_Payment_ID__c = razorpayPaymentId;
lockedPayment.Payment_Date__c = System.now();

customerOrder.Payment_Status__c = 'Paid';

Database.update(lockedPayment, AccessLevel.SYSTEM_MODE);
Database.update(customerOrder, AccessLevel.SYSTEM_MODE);

        return true;

    } catch (AuraHandledException e) {
        throw e;

    } catch (Exception e) {
        System.debug(
            LoggingLevel.ERROR,
            'Payment Verification Error: ' + e.getMessage()
        );

        throw new AuraHandledException(
            'Unable to verify payment. Please contact support.'
        );
    }
}

}
