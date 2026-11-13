
public with sharing class ScentSphereAccountController {

    // ==========================================
    // ACCOUNT RESPONSE
    // ==========================================

    public class AccountData {
        @AuraEnabled public User customerUser { get; set; }
        @AuraEnabled public Contact customer { get; set; }
        @AuraEnabled public List<Customer_Order__c> orders { get; set; }

        public AccountData() {
            orders = new List<Customer_Order__c>();
        }
    }

    // ==========================================
    // ORDER DETAILS RESPONSE
    // ==========================================

    public class OrderDetailsResponse {
        @AuraEnabled public Customer_Order__c orderRecord { get; set; }
        @AuraEnabled public List<Order_Item__c> items { get; set; }

        public OrderDetailsResponse() {
            items = new List<Order_Item__c>();
        }
    }

    private static AuraHandledException buildException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }

    // ==========================================
    // GET ACCOUNT DATA
    // ==========================================

    @AuraEnabled(cacheable=true)
    public static AccountData getAccountData() {

        AccountData result = new AccountData();

        try {

            List<User> currentUsers = [
                SELECT Id, FirstName, LastName, Username, Email, Phone,
                       ContactId, CreatedDate
                FROM User
                WHERE Id = :UserInfo.getUserId()
                WITH USER_MODE
                LIMIT 1
            ];

            if (currentUsers.isEmpty()) {
                throw buildException('Unable to identify your account.');
            }

            User currentUser = currentUsers[0];
            result.customerUser = currentUser;

            if (currentUser.ContactId == null) {
                return result;
            }

            List<Contact> contacts = [
                SELECT Id, FirstName, LastName, Email, Phone,
                       MailingStreet, MailingCity, MailingState,
                       MailingPostalCode, MailingCountry, Account.Name
                FROM Contact
                WHERE Id = :currentUser.ContactId
                WITH USER_MODE
                LIMIT 1
            ];

            if (!contacts.isEmpty()) {
                result.customer = contacts[0];
            }

            
result.orders = [
    SELECT Id, Name, Order_Date__c, Order_Status__c,
           Payment_Status__c, Shipping_Address__c,
           Total_Amount__c
    FROM Customer_Order__c
    WHERE Customer__c = :currentUser.ContactId
    AND Order_Status__c = 'Confirmed'
    WITH USER_MODE
    ORDER BY Order_Date__c DESC NULLS LAST
];


            return result;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            System.debug(
                LoggingLevel.ERROR,
                'getAccountData: ' + e.getMessage()
            );
            throw buildException('Unable to load your account details.');
        }
    }

    // ==========================================
    // GET SELECTED ORDER DETAILS
    // ==========================================

    @AuraEnabled
    public static OrderDetailsResponse getOrderDetails(Id orderId) {

        try {

            if (UserInfo.getUserType() == 'Guest') {
                throw buildException(
                    'Please sign in to view your order details.'
                );
            }

            if (orderId == null) {
                throw buildException('Invalid order selected.');
            }

            // Get logged-in customer's Contact
            List<User> currentUsers = [
                SELECT Id, ContactId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                WITH USER_MODE
                LIMIT 1
            ];

            if (
                currentUsers.isEmpty() ||
                currentUsers[0].ContactId == null
            ) {
                throw buildException(
                    'Customer account not found.'
                );
            }

            Id contactId = currentUsers[0].ContactId;

            // Fetch only the order belonging to this customer
            List<Customer_Order__c> orders = [
                SELECT Id, Name, Order_Date__c,
                       Order_Status__c, Payment_Status__c,
                       Shipping_Address__c, Total_Amount__c
                FROM Customer_Order__c
                WHERE Id = :orderId
                AND Customer__c = :contactId
                WITH USER_MODE
                LIMIT 1
            ];

            if (orders.isEmpty()) {
                throw buildException(
                    'Order not found or you do not have permission to view it.'
                );
            }

            OrderDetailsResponse response =
                new OrderDetailsResponse();

            response.orderRecord = orders[0];

            // Fetch all products belonging to this order
            response.items = [
                SELECT Id, Name,
                       Perfume__c,
                       Perfume__r.Product_Name__c,
                       Perfume__r.Brand__c,
                       Perfume__r.Product_Image_URL__c,
                       Perfume__r.Size__c,
                       Quantity__c,
                       Unit_Price__c
                FROM Order_Item__c
                WHERE Customer_Order__c = :orderId
                WITH USER_MODE
                ORDER BY CreatedDate ASC
            ];

            return response;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            System.debug(
                LoggingLevel.ERROR,
                'getOrderDetails: ' + e.getMessage()
                    + ' | ' + e.getStackTraceString()
            );

            throw buildException(
                'Unable to load order details. Please try again.'
            );
        }
    }
}
