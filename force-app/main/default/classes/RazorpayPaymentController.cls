public without sharing class RazorpayPaymentController {

    // false = client sees only the error code; full detail stays in debug logs.
    // Set to true temporarily when you need details in the browser console.
    private static final Boolean SHOW_DETAIL_TO_CLIENT = false;

    public class RazorpayPaymentLinkResponse {
        @AuraEnabled public String paymentLinkId;
        @AuraEnabled public String paymentLinkUrl;
        @AuraEnabled public String referenceId;
        @AuraEnabled public Id paymentRecordId;
    }

    // Logs full detail server-side, throws an AuraHandledException with a readable message.
    private static void fail(String code, String detail) {
        System.debug(LoggingLevel.ERROR, code + ' | ' + detail);

        String clientMessage = code;
        if (SHOW_DETAIL_TO_CLIENT) {
            clientMessage += ' | ' + detail;
        }

        AuraHandledException ex = new AuraHandledException(clientMessage);
        ex.setMessage(clientMessage);
        throw ex;
    }

    // Exact integer paise (avoids truncation from (Long)(x * 100)).
    private static Long toPaise(Decimal rupees) {
        return (rupees * 100).setScale(0, RoundingMode.HALF_UP).longValue();
    }

    // =========================================================
    // 1. CREATE RAZORPAY PAYMENT LINK
    // =========================================================

    @AuraEnabled
    public static RazorpayPaymentLinkResponse createRazorpayPaymentLink(
        Id customerOrderId
    ) {
        try {
            User currentUser = [
                SELECT ContactId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];

            if (currentUser.ContactId == null) {
                fail('CUSTOMER_NOT_FOUND', 'Current user has no Contact.');
            }

            List<Customer_Order__c> orders = [
                SELECT Id, Name, Customer__c, Total_Amount__c,
                       Payment_Status__c
                FROM Customer_Order__c
                WHERE Id = :customerOrderId
                AND Customer__c = :currentUser.ContactId
                WITH USER_MODE
                LIMIT 1
            ];

            if (orders.isEmpty()) {
                fail('ORDER_NOT_FOUND', 'Order not found or access denied.');
            }

            Customer_Order__c customerOrder = orders[0];

            if (customerOrder.Payment_Status__c == 'Paid') {
                fail('ORDER_ALREADY_PAID', 'This order has already been paid.');
            }

            if (customerOrder.Total_Amount__c == null ||
                customerOrder.Total_Amount__c <= 0) {
                fail('INVALID_AMOUNT', 'Invalid order amount.');
            }

            String referenceId = EncodingUtil.convertToHex(
                Crypto.generateAesKey(128)
            );

            Long amountInPaise = toPaise(customerOrder.Total_Amount__c);

            Map<String, Object> requestBody = new Map<String, Object>{
                'amount' => amountInPaise,
                'currency' => 'INR',
                'accept_partial' => false,
                'reference_id' => referenceId,
                'description' => 'ScentSphere Order ' + customerOrder.Name,
                'callback_url' =>
                    'https://orgfarm-5bd62824fa-dev-ed.develop.my.site.com/scentsphere/payment-return',
                'callback_method' => 'get',
                'notify' => new Map<String, Object>{
                    'sms' => false,
                    'email' => false
                },
                'reminder_enable' => false
            };

            HttpRequest request = new HttpRequest();
            request.setEndpoint('callout:Razorpay_API/v1/payment_links');
            request.setMethod('POST');
            request.setHeader('Content-Type', 'application/json');
            request.setTimeout(30000);
            request.setBody(JSON.serialize(requestBody));

            HttpResponse response = new Http().send(request);

            if (response.getStatusCode() != 200 &&
                response.getStatusCode() != 201) {
                // Body is logged server-side only; it can echo customer data.
                System.debug(LoggingLevel.ERROR,
                    'RAZORPAY_CREATE_BODY: ' + response.getBody());
                fail('RAZORPAY_CREATE_HTTP_ERROR',
                    'HTTP ' + response.getStatusCode());
            }

            Map<String, Object> responseData =
                (Map<String, Object>)JSON.deserializeUntyped(
                    response.getBody()
                );

            String paymentLinkId = (String)responseData.get('id');
            String paymentLinkUrl = (String)responseData.get('short_url');
            String returnedReferenceId =
                (String)responseData.get('reference_id');

            if (String.isBlank(paymentLinkId) ||
                String.isBlank(paymentLinkUrl) ||
                !paymentLinkUrl.startsWith('https://rzp.io/') ||
                returnedReferenceId != referenceId) {

                fail('RAZORPAY_CREATE_INVALID_RESPONSE',
                    'idBlank=' + String.isBlank(paymentLinkId)
                    + ' urlBlank=' + String.isBlank(paymentLinkUrl)
                    + ' refMatch=' + (returnedReferenceId == referenceId));
            }

            Payment__c payment = new Payment__c(
                Customer_Order__c = customerOrder.Id,
                Payment_Amount__c = customerOrder.Total_Amount__c,
                Payment_Status__c = 'Pending',
                Razorpay_Payment_Link_ID__c = paymentLinkId,
                Payment_Link_URL__c = paymentLinkUrl,
                Payment_Link_Reference_ID__c = referenceId,
                Signature_Verified__c = false
            );

            Database.insert(payment, AccessLevel.SYSTEM_MODE);

            RazorpayPaymentLinkResponse result =
                new RazorpayPaymentLinkResponse();

            result.paymentLinkId = paymentLinkId;
            result.paymentLinkUrl = paymentLinkUrl;
            result.referenceId = referenceId;
            result.paymentRecordId = payment.Id;

            return result;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            fail('CREATE_UNEXPECTED_EXCEPTION',
                'Type=' + e.getTypeName()
                + ' | Message=' + e.getMessage()
                + ' | Line=' + e.getLineNumber()
                + ' | Stack=' + e.getStackTraceString());
            return null;
        }
    }

    // =========================================================
    // 2. VERIFY RAZORPAY PAYMENT LINK
    // =========================================================

    @AuraEnabled
    public static Boolean verifyRazorpayPaymentLink(
        String paymentLinkId,
        String razorpayPaymentId
    ) {
        try {
            if (String.isBlank(paymentLinkId)) {
                fail('LINK_ID_MISSING', 'Payment Link ID is missing.');
            }

            if (String.isBlank(razorpayPaymentId)) {
                fail('PAYMENT_ID_MISSING', 'Razorpay Payment ID is missing.');
            }

            paymentLinkId = paymentLinkId.trim();
            razorpayPaymentId = razorpayPaymentId.trim();

            User currentUser = [
                SELECT ContactId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];

            if (currentUser.ContactId == null) {
                fail('CUSTOMER_NOT_FOUND', 'Current user has no Contact.');
            }

            // without sharing class + SYSTEM_MODE: finds the record regardless
            // of sharing. Ownership is enforced explicitly just below.
            List<Payment__c> paymentRecords = [
                SELECT Id, Customer_Order__c, Payment_Amount__c,
                       Payment_Status__c, Razorpay_Payment_Link_ID__c,
                       Payment_Link_Reference_ID__c,
                       Razorpay_Payment_ID__c,
                       Customer_Order__r.Customer__c
                FROM Payment__c
                WHERE Razorpay_Payment_Link_ID__c = :paymentLinkId
                WITH SYSTEM_MODE
                LIMIT 1
            ];

            if (paymentRecords.isEmpty()) {
                fail('PAYMENT_RECORD_NOT_FOUND',
                    'IncomingLinkId=' + paymentLinkId
                    + ' | UserId=' + UserInfo.getUserId()
                    + ' | ContactId=' + currentUser.ContactId);
            }

            Payment__c payment = paymentRecords[0];

            // Customer ownership validation.
            if (payment.Customer_Order__r.Customer__c !=
                currentUser.ContactId) {

                fail('CUSTOMER_OWNERSHIP_MISMATCH',
                    'PaymentOrderCustomer=' + payment.Customer_Order__r.Customer__c
                    + ' | LoggedInContact=' + currentUser.ContactId);
            }

            if (payment.Payment_Status__c == 'Paid') {
                return payment.Razorpay_Payment_ID__c == razorpayPaymentId;
            }

            if (payment.Payment_Status__c != 'Pending' &&
                payment.Payment_Status__c != 'Processing') {

                fail('PAYMENT_STATUS_NOT_ELIGIBLE',
                    'Status=' + payment.Payment_Status__c);
            }

            // -----------------------------------------------------
            // STEP 1: FETCH PAYMENT LINK FROM RAZORPAY
            // -----------------------------------------------------

            HttpRequest linkRequest = new HttpRequest();
            linkRequest.setEndpoint(
                'callout:Razorpay_API/v1/payment_links/' +
                EncodingUtil.urlEncode(paymentLinkId, 'UTF-8')
            );
            linkRequest.setMethod('GET');
            linkRequest.setTimeout(30000);

            HttpResponse linkResponse = new Http().send(linkRequest);

            if (linkResponse.getStatusCode() != 200) {
                System.debug(LoggingLevel.ERROR,
                    'RAZORPAY_LINK_BODY: ' + linkResponse.getBody());
                fail('RAZORPAY_LINK_API_ERROR',
                    'HTTP=' + linkResponse.getStatusCode());
            }

            Map<String, Object> linkData =
                (Map<String, Object>)JSON.deserializeUntyped(
                    linkResponse.getBody()
                );

            String actualLinkId = (String)linkData.get('id');
            String actualLinkStatus = (String)linkData.get('status');
            String actualReferenceId = (String)linkData.get('reference_id');
            String actualCurrency = (String)linkData.get('currency');

            Decimal actualLinkAmount = Decimal.valueOf(
                String.valueOf(linkData.get('amount'))
            );

            Long expectedAmount = toPaise(payment.Payment_Amount__c);

            if (actualLinkId != payment.Razorpay_Payment_Link_ID__c ||
                actualReferenceId != payment.Payment_Link_Reference_ID__c ||
                actualLinkStatus != 'paid' ||
                actualCurrency != 'INR' ||
                actualLinkAmount != expectedAmount) {

                fail('PAYMENT_LINK_VALIDATION_FAILED',
                    'IdMatch=' + (actualLinkId == payment.Razorpay_Payment_Link_ID__c)
                    + ' | RefMatch=' + (actualReferenceId == payment.Payment_Link_Reference_ID__c)
                    + ' | Status=' + actualLinkStatus
                    + ' | Currency=' + actualCurrency
                    + ' | ActualAmount=' + actualLinkAmount
                    + ' | ExpectedAmount=' + expectedAmount);
            }

            // -----------------------------------------------------
            // STEP 2: MATCH CALLBACK PAYMENT ID WITH LINK PAYMENTS
            // -----------------------------------------------------

            Boolean paymentFound = false;
            Object paymentsObject = linkData.get('payments');

            if (paymentsObject instanceof List<Object>) {
                for (Object item : (List<Object>)paymentsObject) {
                    Map<String, Object> itemData = (Map<String, Object>)item;

                    String candidatePaymentId = (String)itemData.get('payment_id');
                    String candidateStatus = (String)itemData.get('status');
                    String candidateLinkId = (String)itemData.get('plink_id');

                    if (candidatePaymentId == razorpayPaymentId &&
                        candidateStatus == 'captured' &&
                        (String.isBlank(candidateLinkId) ||
                         candidateLinkId == paymentLinkId)) {

                        paymentFound = true;
                        break;
                    }
                }
            }

            if (!paymentFound) {
                System.debug(LoggingLevel.ERROR,
                    'LINK_PAYMENTS: ' + JSON.serialize(paymentsObject));
                fail('PAYMENT_ID_MATCH_FAILED',
                    'CallbackPaymentId=' + razorpayPaymentId);
            }

            // -----------------------------------------------------
            // STEP 3: FETCH AND VERIFY PAYMENT ITSELF
            // -----------------------------------------------------

            HttpRequest paymentRequest = new HttpRequest();
            paymentRequest.setEndpoint(
                'callout:Razorpay_API/v1/payments/' +
                EncodingUtil.urlEncode(razorpayPaymentId, 'UTF-8')
            );
            paymentRequest.setMethod('GET');
            paymentRequest.setTimeout(30000);

            HttpResponse paymentResponse = new Http().send(paymentRequest);

            if (paymentResponse.getStatusCode() != 200) {
                System.debug(LoggingLevel.ERROR,
                    'RAZORPAY_PAYMENT_BODY: ' + paymentResponse.getBody());
                fail('RAZORPAY_PAYMENT_API_ERROR',
                    'HTTP=' + paymentResponse.getStatusCode());
            }

            Map<String, Object> paymentData =
                (Map<String, Object>)JSON.deserializeUntyped(
                    paymentResponse.getBody()
                );

            String actualPaymentId = (String)paymentData.get('id');
            String actualPaymentStatus = (String)paymentData.get('status');
            String actualPaymentCurrency = (String)paymentData.get('currency');

            Decimal actualPaymentAmount = Decimal.valueOf(
                String.valueOf(paymentData.get('amount'))
            );

            if (actualPaymentId != razorpayPaymentId ||
                actualPaymentStatus != 'captured' ||
                actualPaymentCurrency != 'INR' ||
                actualPaymentAmount != expectedAmount) {

                fail('CAPTURED_PAYMENT_VALIDATION_FAILED',
                    'PaymentId=' + actualPaymentId
                    + ' | Status=' + actualPaymentStatus
                    + ' | Currency=' + actualPaymentCurrency
                    + ' | Amount=' + actualPaymentAmount
                    + ' | ExpectedAmount=' + expectedAmount);
            }

            // -----------------------------------------------------
            // STEP 4: LOCK PAYMENT AND ORDER
            // -----------------------------------------------------

            Payment__c lockedPayment = [
                SELECT Id, Customer_Order__c, Payment_Status__c,
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

            if (lockedPayment.Payment_Status__c == 'Paid') {
                return lockedPayment.Razorpay_Payment_ID__c == razorpayPaymentId;
            }

            if (customerOrder.Payment_Status__c == 'Paid') {
                fail('ORDER_PAID_BY_OTHER_PAYMENT',
                    'This order has already been paid using another payment.');
            }

            // -----------------------------------------------------
            // STEP 5: FETCH ORDER ITEMS
            // -----------------------------------------------------

            List<Order_Item__c> orderItems = [
                SELECT Perfume__c, Quantity__c
                FROM Order_Item__c
                WHERE Customer_Order__c = :customerOrder.Id
            ];

            if (orderItems.isEmpty()) {
                fail('NO_ORDER_ITEMS', 'No items found for this order.');
            }

            // -----------------------------------------------------
            // STEP 6: CALCULATE REQUIRED STOCK
            // -----------------------------------------------------

            Map<Id, Decimal> requiredStock = new Map<Id, Decimal>();

            for (Order_Item__c item : orderItems) {
                if (item.Perfume__c == null ||
                    item.Quantity__c == null ||
                    item.Quantity__c <= 0) {

                    fail('INVALID_ORDER_ITEM',
                        'Invalid product or quantity in order.');
                }

                Decimal currentQuantity =
                    requiredStock.containsKey(item.Perfume__c)
                    ? requiredStock.get(item.Perfume__c)
                    : 0;

                requiredStock.put(
                    item.Perfume__c,
                    currentQuantity + item.Quantity__c
                );
            }

            // -----------------------------------------------------
            // STEP 7: LOCK AND UPDATE INVENTORY
            // -----------------------------------------------------

            List<Perfume__c> perfumes = [
                SELECT Id, Product_Name__c, Stock_Quantity__c
                FROM Perfume__c
                WHERE Id IN :requiredStock.keySet()
                FOR UPDATE
            ];

            if (perfumes.size() != requiredStock.size()) {
                fail('PRODUCTS_NOT_FOUND',
                    'One or more products could not be found.');
            }

            for (Perfume__c perfume : perfumes) {
                Decimal availableStock =
                    perfume.Stock_Quantity__c == null
                    ? 0
                    : perfume.Stock_Quantity__c;

                Decimal requestedStock = requiredStock.get(perfume.Id);

                if (availableStock < requestedStock) {
                    fail('INSUFFICIENT_STOCK',
                        'Insufficient stock for ' + perfume.Product_Name__c + '.');
                }

                perfume.Stock_Quantity__c = availableStock - requestedStock;
            }

            // -----------------------------------------------------
            // STEP 8: UPDATE SALESFORCE PAYMENT AND ORDER
            // -----------------------------------------------------

            lockedPayment.Payment_Status__c = 'Paid';
            lockedPayment.Razorpay_Payment_ID__c = razorpayPaymentId;
            lockedPayment.Payment_Date__c = System.now();

            customerOrder.Payment_Status__c = 'Paid';
            customerOrder.Order_Status__c = 'Confirmed';

            Database.update(perfumes, AccessLevel.SYSTEM_MODE);
            Database.update(lockedPayment, AccessLevel.SYSTEM_MODE);
            Database.update(customerOrder, AccessLevel.SYSTEM_MODE);

            // Signature_Verified__c intentionally stays false until
            // callback HMAC signature verification is implemented.

            return true;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            fail('VERIFY_UNEXPECTED_EXCEPTION',
                'Type=' + e.getTypeName()
                + ' | Message=' + e.getMessage()
                + ' | Line=' + e.getLineNumber()
                + ' | Stack=' + e.getStackTraceString());
            return null;
        }
    }

    // =========================================================
    // 3. CHECK PAYMENT LINK STATUS (used for polling)
    // =========================================================
    // Lets the ScentSphere tab confirm a payment without waiting for the
    // Razorpay browser redirect. It does NOT duplicate the verification or
    // the stock/payment/order updates: once Razorpay reports the link as
    // paid with a captured payment, it hands over to the unchanged
    // verifyRazorpayPaymentLink(), which performs every existing check.
    // The payment id comes from Razorpay's own response, not from the URL.

    public class PaymentStatusResponse {
        @AuraEnabled public String status;            // 'PAID' or 'PENDING'
        @AuraEnabled public String razorpayPaymentId; // set when status = 'PAID'
    }

    @AuraEnabled
    public static PaymentStatusResponse checkPaymentLinkStatus(
        String paymentLinkId
    ) {
        try {
            if (String.isBlank(paymentLinkId)) {
                fail('LINK_ID_MISSING', 'Payment Link ID is missing.');
            }

            paymentLinkId = paymentLinkId.trim();

            User currentUser = [
                SELECT ContactId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];

            if (currentUser.ContactId == null) {
                fail('CUSTOMER_NOT_FOUND', 'Current user has no Contact.');
            }

            List<Payment__c> paymentRecords = [
                SELECT Id, Payment_Status__c, Razorpay_Payment_ID__c,
                       Customer_Order__r.Customer__c
                FROM Payment__c
                WHERE Razorpay_Payment_Link_ID__c = :paymentLinkId
                WITH SYSTEM_MODE
                LIMIT 1
            ];

            if (paymentRecords.isEmpty()) {
                fail('PAYMENT_RECORD_NOT_FOUND',
                    'IncomingLinkId=' + paymentLinkId
                    + ' | UserId=' + UserInfo.getUserId()
                    + ' | ContactId=' + currentUser.ContactId);
            }

            Payment__c payment = paymentRecords[0];

            // Customer ownership validation, before any Razorpay call.
            if (payment.Customer_Order__r.Customer__c !=
                currentUser.ContactId) {

                fail('CUSTOMER_OWNERSHIP_MISMATCH',
                    'PaymentOrderCustomer=' + payment.Customer_Order__r.Customer__c
                    + ' | LoggedInContact=' + currentUser.ContactId);
            }

            PaymentStatusResponse result = new PaymentStatusResponse();
            result.status = 'PENDING';

            // Already confirmed earlier (for example by the redirect tab).
            if (payment.Payment_Status__c == 'Paid') {
                result.status = 'PAID';
                result.razorpayPaymentId = payment.Razorpay_Payment_ID__c;
                return result;
            }

            HttpRequest linkRequest = new HttpRequest();
            linkRequest.setEndpoint(
                'callout:Razorpay_API/v1/payment_links/' +
                EncodingUtil.urlEncode(paymentLinkId, 'UTF-8')
            );
            linkRequest.setMethod('GET');
            linkRequest.setTimeout(30000);

            HttpResponse linkResponse = new Http().send(linkRequest);

            if (linkResponse.getStatusCode() != 200) {
                // Transient problem: keep polling. Body stays in the log only.
                System.debug(LoggingLevel.ERROR,
                    'POLL_LINK_API_ERROR HTTP=' + linkResponse.getStatusCode()
                    + ' | Body: ' + linkResponse.getBody());
                return result;
            }

            Map<String, Object> linkData =
                (Map<String, Object>)JSON.deserializeUntyped(
                    linkResponse.getBody()
                );

            if ((String)linkData.get('status') != 'paid') {
                return result;
            }

            String capturedPaymentId;
            Object paymentsObject = linkData.get('payments');

            if (paymentsObject instanceof List<Object>) {
                for (Object item : (List<Object>)paymentsObject) {
                    Map<String, Object> itemData = (Map<String, Object>)item;

                    String candidatePaymentId = (String)itemData.get('payment_id');
                    String candidateStatus = (String)itemData.get('status');

                    if (candidateStatus == 'captured' &&
                        !String.isBlank(candidatePaymentId)) {

                        capturedPaymentId = candidatePaymentId;
                        break;
                    }
                }
            }

            // Link is paid but the captured payment is not listed yet.
            if (String.isBlank(capturedPaymentId)) {
                return result;
            }

            // All existing validations and updates (amount, currency,
            // reference, ownership, locking, stock once, order status).
            Boolean verified =
                verifyRazorpayPaymentLink(paymentLinkId, capturedPaymentId);

            if (verified != true) {
                fail('PAYMENT_ID_MISMATCH',
                    'Payment was already confirmed with a different payment id.');
            }

            result.status = 'PAID';
            result.razorpayPaymentId = capturedPaymentId;
            return result;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            fail('POLL_UNEXPECTED_EXCEPTION',
                'Type=' + e.getTypeName()
                + ' | Message=' + e.getMessage()
                + ' | Line=' + e.getLineNumber()
                + ' | Stack=' + e.getStackTraceString());
            return null;
        }
    }
}