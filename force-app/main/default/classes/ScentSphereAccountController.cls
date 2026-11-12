public with sharing class ScentSphereAccountController {

    public class AccountData {
        @AuraEnabled public User customerUser { get; set; }
        @AuraEnabled public Contact customer { get; set; }
        @AuraEnabled public List<Customer_Order__c> orders { get; set; }

        public AccountData() {
            orders = new List<Customer_Order__c>();
        }
    }

    @AuraEnabled(cacheable=true)
    public static AccountData getAccountData() {

        AccountData result = new AccountData();

        User currentUser = [
            SELECT Id, FirstName, LastName, Username, Email, Phone,
                   ContactId, CreatedDate
            FROM User
            WHERE Id = :UserInfo.getUserId()
            WITH USER_MODE
            LIMIT 1
        ];

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
            WITH USER_MODE
            ORDER BY Order_Date__c DESC NULLS LAST
        ];

        return result;
    }
}