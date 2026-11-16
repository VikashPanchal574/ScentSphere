@IsTest
private class PaymentReturnControllerTest {

    private static final String CUSTOMER_PROFILE_NAME = 'ScentSphere Customer User';

    private class TestUsers {
        User owner;
        User customerA;
        User customerB;
        Id contactAId;
        Id contactBId;
    }

    private static TestUsers createTestUsers() {
        TestUsers testUsers = new TestUsers();
        String uniqueValue = String.valueOf(DateTime.now().getTime());

        Id ownerProfileId = [
            SELECT Id
            FROM Profile
            WHERE PermissionsModifyAllData = true
            LIMIT 1
        ].Id;
        Id customerProfileId = [
            SELECT Id
            FROM Profile
            WHERE Name = :CUSTOMER_PROFILE_NAME
            LIMIT 1
        ].Id;

        UserRole ownerRole = new UserRole(
            Name = 'Payment Return Test Owner Role',
            DeveloperName = 'Payment_Return_Test_Owner_Role'
        );
        insert ownerRole;

        testUsers.owner = new User(
            ProfileId = ownerProfileId,
            UserRoleId = ownerRole.Id,
            Alias = 'payown',
            Username = 'payment.owner.' + uniqueValue + '@example.com',
            Email = 'payment.owner.' + uniqueValue + '@example.com',
            LastName = 'PaymentOwner',
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert testUsers.owner;

        Contact contactA;
        Contact contactB;
        System.runAs(testUsers.owner) {
            Account account = new Account(Name = 'Payment Return Test Account');
            insert account;

            contactA = new Contact(
                AccountId = account.Id,
                FirstName = 'Payment',
                LastName = 'Customer A'
            );
            contactB = new Contact(
                AccountId = account.Id,
                FirstName = 'Payment',
                LastName = 'Customer B'
            );
            insert new List<Contact>{ contactA, contactB };
        }

        testUsers.contactAId = contactA.Id;
        testUsers.contactBId = contactB.Id;
        testUsers.customerA = buildCustomerUser(
            customerProfileId,
            contactA.Id,
            'paycA',
            'a',
            uniqueValue
        );
        testUsers.customerB = buildCustomerUser(
            customerProfileId,
            contactB.Id,
            'paycB',
            'b',
            uniqueValue
        );

        System.runAs(testUsers.owner) {
            Test.startTest();
            insert new List<User>{ testUsers.customerA, testUsers.customerB };
            Test.stopTest();
        }

        return testUsers;
    }

    private static User buildCustomerUser(
        Id profileId,
        Id contactId,
        String alias,
        String suffix,
        String uniqueValue
    ) {
        String username = 'payment.customer.' + suffix + '.' +
            uniqueValue + '@example.com';
        return new User(
            ProfileId = profileId,
            ContactId = contactId,
            Alias = alias,
            Username = username,
            Email = username,
            LastName = 'PaymentCustomer' + suffix,
            CommunityNickname = 'payment' + suffix + uniqueValue,
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
    }

    private static Id createPayment(
        User owner,
        Id contactId,
        String paymentStatus,
        String paymentLinkId
    ) {
        Id orderId;
        System.runAs(owner) {
            Customer_Order__c orderRecord = new Customer_Order__c(
                Customer__c = contactId,
                Order_Date__c = Date.today(),
                Total_Amount__c = 200,
                Order_Status__c = 'Pending',
                Payment_Status__c = paymentStatus
            );
            insert orderRecord;
            orderId = orderRecord.Id;

            insert new Payment__c(
                Customer_Order__c = orderRecord.Id,
                Payment_Amount__c = 200,
                Payment_Status__c = paymentStatus,
                Payment_Method__c = 'Razorpay',
                Razorpay_Payment_Link_ID__c = paymentLinkId
            );
        }
        return orderId;
    }

    private static void assertPaymentLinkThrows(String paymentLinkId) {
        Boolean exceptionThrown = false;
        try {
            PaymentReturnController.getOrderIdForPaidLink(paymentLinkId);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    @IsTest
    static void testGetOrderIdForPaidLinkRequiresLinkId() {
        assertPaymentLinkThrows('  ');
    }

    @IsTest
    static void testGetOrderIdForPaidLinkRequiresCustomerContact() {
        TestUsers testUsers = createTestUsers();
        System.runAs(testUsers.owner) {
            assertPaymentLinkThrows('payment-link');
        }
    }

    @IsTest
    static void testGetOrderIdForPaidLinkRejectsUnknownLink() {
        TestUsers testUsers = createTestUsers();
        System.runAs(testUsers.customerA) {
            assertPaymentLinkThrows('unknown-payment-link');
        }
    }

    @IsTest
    static void testGetOrderIdForPaidLinkRejectsUnpaidPayment() {
        TestUsers testUsers = createTestUsers();
        String paymentLinkId = 'pending-link-' +
            String.valueOf(DateTime.now().getTime());
        createPayment(
            testUsers.owner,
            testUsers.contactAId,
            'Pending',
            paymentLinkId
        );

        System.runAs(testUsers.customerA) {
            assertPaymentLinkThrows(paymentLinkId);
        }
    }

    @IsTest
    static void testGetOrderIdForPaidLinkReturnsCustomerOrder() {
        TestUsers testUsers = createTestUsers();
        String paymentLinkId = 'paid-link-' +
            String.valueOf(DateTime.now().getTime());
        Id expectedOrderId = createPayment(
            testUsers.owner,
            testUsers.contactAId,
            'Paid',
            paymentLinkId
        );

        System.runAs(testUsers.customerA) {
            Id actualOrderId =
                PaymentReturnController.getOrderIdForPaidLink(
                    '  ' + paymentLinkId + '  '
                );
            System.assertEquals(expectedOrderId, actualOrderId);
        }
    }

    @IsTest
    static void testGetOrderIdForPaidLinkDeniesAnotherCustomersPayment() {
        TestUsers testUsers = createTestUsers();
        String paymentLinkId = 'other-customer-link-' +
            String.valueOf(DateTime.now().getTime());
        createPayment(
            testUsers.owner,
            testUsers.contactBId,
            'Paid',
            paymentLinkId
        );

        System.runAs(testUsers.customerA) {
            assertPaymentLinkThrows(paymentLinkId);
        }
    }
}
