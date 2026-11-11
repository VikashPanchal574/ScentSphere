public without sharing class PaymentReturnController {

    // Returns the Customer Order Id for a payment link, only if:
    //  - the logged-in customer owns the order, and
    //  - the payment has already been verified as Paid.
    // Read-only: does not change any payment, order or stock data.
    @AuraEnabled
    public static Id getOrderIdForPaidLink(String paymentLinkId) {

        if (String.isBlank(paymentLinkId)) {
            throw new AuraHandledException('Payment Link ID is missing.');
        }

        User currentUser = [
            SELECT ContactId
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        if (currentUser.ContactId == null) {
            throw new AuraHandledException(
                'Please sign in with your customer account.'
            );
        }

        List<Payment__c> payments = [
            SELECT Customer_Order__c, Payment_Status__c,
                   Customer_Order__r.Customer__c
            FROM Payment__c
            WHERE Razorpay_Payment_Link_ID__c = :paymentLinkId.trim()
            WITH SYSTEM_MODE
            LIMIT 1
        ];

        if (payments.isEmpty() ||
            payments[0].Customer_Order__r.Customer__c !=
                currentUser.ContactId) {

            throw new AuraHandledException(
                'Order not found or access denied.'
            );
        }

        if (payments[0].Payment_Status__c != 'Paid') {
            throw new AuraHandledException(
                'Payment is not confirmed yet.'
            );
        }

        return payments[0].Customer_Order__c;
    }
}