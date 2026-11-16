@IsTest
private class OrderConfirmationControllerTest {

    private static final String CUSTOMER_PROFILE_NAME = 'ScentSphere Customer User';
    private static final String CUSTOMER_PERMISSION_SET = 'ScentSphere_Customer_Access';
    private static final String PERFUME_NAME = 'Order Confirmation Test Perfume';

    private class TestUsers {
        User owner;
        User customerA;
        User customerB;
        Id contactAId;
        Id contactBId;
    }

    @TestSetup
    static void setupPerfume() {
        insert new Perfume__c(
            Product_Name__c = PERFUME_NAME,
            Brand__c = 'Dior',
            Category__c = 'Floral',
            Description__c = 'Order confirmation test perfume',
            Price__c = 100,
            Size__c = '100 ml',
            Product_Image_URL__c = 'https://example.com/perfume.jpg',
            Stock_Quantity__c = 10,
            Active__c = true
        );
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
            Name = 'Order Confirmation Test Owner Role',
            DeveloperName = 'Order_Confirmation_Test_Owner_Role'
        );
        insert ownerRole;

        testUsers.owner = new User(
            ProfileId = ownerProfileId,
            UserRoleId = ownerRole.Id,
            Alias = 'ordown',
            Username = 'order.owner.' + uniqueValue + '@example.com',
            Email = 'order.owner.' + uniqueValue + '@example.com',
            LastName = 'OrderOwner',
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert testUsers.owner;

        Contact contactA;
        Contact contactB;
        System.runAs(testUsers.owner) {
            Account account = new Account(Name = 'Order Confirmation Test Account');
            insert account;

            contactA = new Contact(
                AccountId = account.Id,
                FirstName = 'Order',
                LastName = 'Customer A'
            );
            contactB = new Contact(
                AccountId = account.Id,
                FirstName = 'Order',
                LastName = 'Customer B'
            );
            insert new List<Contact>{ contactA, contactB };
        }

        testUsers.contactAId = contactA.Id;
        testUsers.contactBId = contactB.Id;
        testUsers.customerA = buildCustomerUser(
            customerProfileId,
            contactA.Id,
            'ordcA',
            'a',
            uniqueValue
        );
        testUsers.customerB = buildCustomerUser(
            customerProfileId,
            contactB.Id,
            'ordcB',
            'b',
            uniqueValue
        );

        System.runAs(testUsers.owner) {
            Test.startTest();
            insert new List<User>{ testUsers.customerA, testUsers.customerB };
            Test.stopTest();
        }

        System.runAs(testUsers.owner) {
            Set<Id> customerIds = new Set<Id>{
                testUsers.customerA.Id,
                testUsers.customerB.Id
            };
            PermissionSet permissionSet = [
                SELECT Id
                FROM PermissionSet
                WHERE Name = :CUSTOMER_PERMISSION_SET
                LIMIT 1
            ];
            Set<Id> assignedUserIds = new Set<Id>();
            for (PermissionSetAssignment assignment : [
                SELECT AssigneeId
                FROM PermissionSetAssignment
                WHERE AssigneeId IN :customerIds
                AND PermissionSetId = :permissionSet.Id
            ]) {
                assignedUserIds.add(assignment.AssigneeId);
            }

            List<PermissionSetAssignment> assignmentsToInsert =
                new List<PermissionSetAssignment>();
            for (User customer : new List<User>{
                testUsers.customerA,
                testUsers.customerB
            }) {
                if (!assignedUserIds.contains(customer.Id)) {
                    assignmentsToInsert.add(new PermissionSetAssignment(
                        AssigneeId = customer.Id,
                        PermissionSetId = permissionSet.Id
                    ));
                }
            }
            if (!assignmentsToInsert.isEmpty()) {
                insert assignmentsToInsert;
            }
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
        String username = 'order.customer.' + suffix + '.' +
            uniqueValue + '@example.com';
        return new User(
            ProfileId = profileId,
            ContactId = contactId,
            Alias = alias,
            Username = username,
            Email = username,
            LastName = 'OrderCustomer' + suffix,
            CommunityNickname = 'order' + suffix + uniqueValue,
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
    }

    private static Id getPerfumeId() {
        return [
            SELECT Id
            FROM Perfume__c
            WHERE Product_Name__c = :PERFUME_NAME
            LIMIT 1
        ].Id;
    }

    private static Customer_Order__c buildOrder(Id contactId, String paymentStatus) {
        return new Customer_Order__c(
            Customer__c = contactId,
            Order_Date__c = Date.today(),
            Total_Amount__c = 200,
            Order_Status__c = 'Pending',
            Payment_Status__c = paymentStatus,
            Shipping_Address__c = 'Test shipping address'
        );
    }

    private static void assertOrderDetailsThrows(Id orderId) {
        Boolean exceptionThrown = false;
        try {
            OrderConfirmationController.getOrderDetails(orderId);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    @IsTest
    static void testGetOrderDetailsReturnsPaidOrderAndItems() {
        TestUsers testUsers = createTestUsers();
        Id perfumeId = getPerfumeId();
        Id orderId;

        System.runAs(testUsers.customerA) {
            Customer_Order__c orderRecord = buildOrder(
                testUsers.contactAId,
                'Paid'
            );
            insert orderRecord;
            orderId = orderRecord.Id;

            insert new Order_Item__c(
                Customer_Order__c = orderRecord.Id,
                Perfume__c = perfumeId,
                Quantity__c = 2,
                Unit_Price__c = 100
            );

            OrderConfirmationController.OrderDetailsWrapper result =
                OrderConfirmationController.getOrderDetails(orderId);

            System.assertEquals(orderId, result.orderRecord.Id);
            System.assertEquals(testUsers.contactAId, result.orderRecord.Customer__c);
            System.assertEquals('Paid', result.orderRecord.Payment_Status__c);
            System.assertEquals(1, result.orderItems.size());
            System.assertEquals(perfumeId, result.orderItems[0].Perfume__c);
            System.assertEquals(
                PERFUME_NAME,
                result.orderItems[0].Perfume__r.Product_Name__c
            );
            System.assertEquals(2, result.orderItems[0].Quantity__c);
            System.assertEquals(100, result.orderItems[0].Unit_Price__c);
        }
    }

    @IsTest
    static void testGetOrderDetailsRequiresOrderId() {
        assertOrderDetailsThrows(null);
    }

    @IsTest
    static void testGetOrderDetailsRequiresCustomerContact() {
        TestUsers testUsers = createTestUsers();
        Id orderId;
        System.runAs(testUsers.owner) {
            Customer_Order__c orderRecord = buildOrder(
                testUsers.contactAId,
                'Paid'
            );
            insert orderRecord;
            orderId = orderRecord.Id;
            assertOrderDetailsThrows(orderId);
        }
    }

    @IsTest
    static void testGetOrderDetailsRejectsUnpaidOrder() {
        TestUsers testUsers = createTestUsers();
        Id unpaidOrderId;
        System.runAs(testUsers.customerA) {
            Customer_Order__c unpaidOrder = buildOrder(
                testUsers.contactAId,
                'Pending'
            );
            insert unpaidOrder;
            unpaidOrderId = unpaidOrder.Id;
            assertOrderDetailsThrows(unpaidOrderId);
        }
    }

    @IsTest
    static void testGetOrderDetailsDeniesAnotherCustomersOrder() {
        TestUsers testUsers = createTestUsers();
        Id otherCustomersOrderId;
        System.runAs(testUsers.customerB) {
            Customer_Order__c otherCustomersOrder = buildOrder(
                testUsers.contactBId,
                'Paid'
            );
            insert otherCustomersOrder;
            otherCustomersOrderId = otherCustomersOrder.Id;
        }

        System.runAs(testUsers.customerA) {
            assertOrderDetailsThrows(otherCustomersOrderId);
        }
    }

    @IsTest
    static void testGetOrderDetailsReturnsEmptyItemList() {
        TestUsers testUsers = createTestUsers();
        Id orderId;
        System.runAs(testUsers.customerA) {
            Customer_Order__c paidOrder = buildOrder(
                testUsers.contactAId,
                'Paid'
            );
            insert paidOrder;
            orderId = paidOrder.Id;

            OrderConfirmationController.OrderDetailsWrapper result =
                OrderConfirmationController.getOrderDetails(orderId);

            System.assertEquals(orderId, result.orderRecord.Id);
            System.assertNotEquals(null, result.orderItems);
            System.assertEquals(0, result.orderItems.size());
        }
    }
}
