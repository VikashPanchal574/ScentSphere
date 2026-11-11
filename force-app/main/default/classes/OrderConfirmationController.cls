
public with sharing class OrderConfirmationController {

    public class OrderDetailsWrapper {
        @AuraEnabled public Customer_Order__c orderRecord;
        @AuraEnabled public List<Order_Item__c> orderItems;
    }

    @AuraEnabled(cacheable=true)
    public static OrderDetailsWrapper getOrderDetails(Id orderId) {

        if (orderId == null) {
            throw new AuraHandledException('Order ID is required.');
        }

        try {
            // 1. Get logged-in customer's Contact Id
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

            // 2. Fetch only this customer's order
            List<Customer_Order__c> orders = [
                SELECT Id, Name, Customer__c, Order_Date__c,
                       Order_Status__c, Payment_Status__c,
                       Shipping_Address__c, Total_Amount__c
                FROM Customer_Order__c
                WHERE Id = :orderId
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

            // 3. Allow confirmation only after successful payment
            if (customerOrder.Payment_Status__c != 'Paid') {
                throw new AuraHandledException(
                    'Order confirmation is available only after successful payment.'
                );
            }

            // 4. Fetch order items
           List<Order_Item__c> items = [
    SELECT Id, Perfume__c, Perfume__r.Product_Name__c,
           Perfume__r.Product_Image_URL__c,
           Quantity__c, Unit_Price__c, Subtotal__c
    FROM Order_Item__c
    WHERE Customer_Order__c = :customerOrder.Id
    WITH USER_MODE
];

            // 5. Prepare response
            OrderDetailsWrapper result = new OrderDetailsWrapper();
            result.orderRecord = customerOrder;
            result.orderItems = items;

            return result;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            System.debug(
                LoggingLevel.ERROR,
                'Order Confirmation Error: ' + e.getMessage()
            );

            throw new AuraHandledException(
                'Unable to load order details.'
            );
        }
    }
}
