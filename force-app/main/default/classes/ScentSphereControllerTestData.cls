@IsTest
public class ScentSphereControllerTestData {

    public class CustomerContext {
        public User owner;
        public User customer;
        public Id contactId;
    }

    public static CustomerContext createCustomer(String testName) {
        CustomerContext context = new CustomerContext();
        String uniqueValue = String.valueOf(DateTime.now().getTime()) +
            EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 8);

        Id ownerProfileId = [
            SELECT Id
            FROM Profile
            WHERE PermissionsModifyAllData = true
            LIMIT 1
        ].Id;
        Id customerProfileId = [
            SELECT Id
            FROM Profile
            WHERE Name = 'ScentSphere Customer User'
            LIMIT 1
        ].Id;

        String roleSuffix = uniqueValue.replace('-', '');
        UserRole ownerRole = new UserRole(
            Name = 'SS Test ' + roleSuffix,
            DeveloperName = 'SS_Test_' + roleSuffix
        );
        insert ownerRole;

        String ownerUsername = 'ss.owner.' + uniqueValue + '@example.com';
        context.owner = new User(
            ProfileId = ownerProfileId,
            UserRoleId = ownerRole.Id,
            Alias = 'sstowner',
            Username = ownerUsername,
            Email = ownerUsername,
            LastName = 'ScentSphereTestOwner',
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert context.owner;

        Contact customerContact;
        System.runAs(context.owner) {
            Account account = new Account(
                Name = 'ScentSphere Test ' + testName + ' ' + roleSuffix
            );
            insert account;

            customerContact = new Contact(
                AccountId = account.Id,
                FirstName = 'ScentSphere',
                LastName = 'TestCustomer',
                Email = 'ss.customer.' + uniqueValue + '@example.com'
            );
            insert customerContact;
        }

        context.contactId = customerContact.Id;
        String customerUsername =
            'ss.customer.' + uniqueValue + '@example.com';
        context.customer = new User(
            ProfileId = customerProfileId,
            ContactId = customerContact.Id,
            Alias = 'sstcust',
            Username = customerUsername,
            Email = customerUsername,
            LastName = 'ScentSphereTestCustomer',
            CommunityNickname = 'ss' + uniqueValue,
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );

        System.runAs(context.owner) {
            insert context.customer;

            PermissionSet customerAccess = [
                SELECT Id
                FROM PermissionSet
                WHERE Name = 'ScentSphere_Customer_Access'
                LIMIT 1
            ];
            insert new PermissionSetAssignment(
                AssigneeId = context.customer.Id,
                PermissionSetId = customerAccess.Id
            );
        }

        return context;
    }

    public static Perfume__c createPerfume(
        String productName,
        Decimal stockQuantity
    ) {
        Perfume__c perfume = new Perfume__c(
            Product_Name__c = productName,
            Brand__c = 'Dior',
            Category__c = 'Floral',
            Price__c = 200,
            Size__c = '100 ml',
            Description__c = 'Controller test perfume',
            Product_Image_URL__c = 'https://example.com/perfume.jpg',
            Stock_Quantity__c = stockQuantity,
            Active__c = true
        );
        insert perfume;
        return perfume;
    }

    public static Customer_Order__c buildOrder(
        Id contactId,
        String orderStatus,
        String paymentStatus,
        Decimal totalAmount
    ) {
        return new Customer_Order__c(
            Customer__c = contactId,
            Order_Date__c = Date.today(),
            Total_Amount__c = totalAmount,
            Order_Status__c = orderStatus,
            Payment_Status__c = paymentStatus,
            Shipping_Address__c = 'Test shipping address'
        );
    }
}
