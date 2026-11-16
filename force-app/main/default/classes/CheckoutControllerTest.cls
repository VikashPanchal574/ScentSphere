@IsTest
private class CheckoutControllerTest {

    private static final String ACTIVE_PERFUME = 'Checkout Test Active';
    private static final String INACTIVE_PERFUME = 'Checkout Test Inactive';
    private static final String CUSTOMER_PROFILE_NAME = 'ScentSphere Customer User';
    private static final String CUSTOMER_PERMISSION_SET = 'ScentSphere_Customer_Access';

    private class TestCustomer {
        User owner;
        User customer;
        Id contactId;
    }

    @TestSetup
    static void setupPerfumes() {
        insert new List<Perfume__c>{
            new Perfume__c(
                Product_Name__c = ACTIVE_PERFUME,
                Brand__c = 'Dior',
                Size__c = '100 ml',
                Price__c = 100,
                Stock_Quantity__c = 5,
                Active__c = true
            ),
            new Perfume__c(
                Product_Name__c = INACTIVE_PERFUME,
                Brand__c = 'Dior',
                Size__c = '100 ml',
                Price__c = 100,
                Stock_Quantity__c = 5,
                Active__c = false
            )
        };
    }

    private static TestCustomer createCustomer() {
        TestCustomer testCustomer = new TestCustomer();
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
            Name = 'Checkout Test Owner Role',
            DeveloperName = 'Checkout_Test_Owner_Role'
        );
        insert ownerRole;

        testCustomer.owner = new User(
            ProfileId = ownerProfileId,
            UserRoleId = ownerRole.Id,
            Alias = 'chkown',
            Username = 'checkout.owner.' + uniqueValue + '@example.com',
            Email = 'checkout.owner.' + uniqueValue + '@example.com',
            LastName = 'CheckoutOwner',
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert testCustomer.owner;

        Contact customerContact;
        System.runAs(testCustomer.owner) {
            Account account = new Account(Name = 'Checkout Test Customer');
            insert account;

            customerContact = new Contact(
                AccountId = account.Id,
                FirstName = 'Checkout',
                LastName = 'Customer'
            );
            insert customerContact;
        }

        testCustomer.contactId = customerContact.Id;
        testCustomer.customer = new User(
            ProfileId = customerProfileId,
            ContactId = customerContact.Id,
            Alias = 'chkcus',
            Username = 'checkout.customer.' + uniqueValue + '@example.com',
            Email = 'checkout.customer.' + uniqueValue + '@example.com',
            LastName = 'CheckoutCustomer',
            CommunityNickname = 'checkout' + uniqueValue,
            TimeZoneSidKey = 'Asia/Kolkata',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );

        System.runAs(testCustomer.owner) {
            Test.startTest();
            insert testCustomer.customer;
            Test.stopTest();
        }

        System.runAs(testCustomer.owner) {
            PermissionSet permissionSet = [
                SELECT Id
                FROM PermissionSet
                WHERE Name = :CUSTOMER_PERMISSION_SET
                LIMIT 1
            ];
            List<PermissionSetAssignment> existingAssignments = [
                SELECT Id
                FROM PermissionSetAssignment
                WHERE AssigneeId = :testCustomer.customer.Id
                AND PermissionSetId = :permissionSet.Id
                LIMIT 1
            ];
            if (existingAssignments.isEmpty()) {
                insert new PermissionSetAssignment(
                    AssigneeId = testCustomer.customer.Id,
                    PermissionSetId = permissionSet.Id
                );
            }
        }

        return testCustomer;
    }

    private static Id getPerfumeId(String productName) {
        return [
            SELECT Id
            FROM Perfume__c
            WHERE Product_Name__c = :productName
            LIMIT 1
        ].Id;
    }

    private static void assertPlaceOrderThrows(
        String fullName,
        String mobileNumber,
        String houseNumber,
        String streetArea,
        String landmark,
        String city,
        String shippingState,
        String pinCode,
        String country
    ) {
        Boolean exceptionThrown = false;
        try {
            CheckoutController.placeOrder(
                fullName,
                mobileNumber,
                houseNumber,
                streetArea,
                landmark,
                city,
                shippingState,
                pinCode,
                country
            );
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    private static void assertValidAddressThrows() {
        assertPlaceOrderThrows(
            'Test Customer',
            '9876543210',
            'Flat 12',
            'MG Road',
            '',
            'Mumbai',
            'Maharashtra',
            '400001',
            'India'
        );
    }

    @IsTest
    static void testPlaceOrderCreatesOrderAndConvertsCart() {
        TestCustomer testCustomer = createCustomer();
        Id perfumeId = getPerfumeId(ACTIVE_PERFUME);
        Id orderId;
        Id cartId;

        System.runAs(testCustomer.customer) {
            Shopping_Cart__c cart = new Shopping_Cart__c(
                Customer__c = testCustomer.contactId,
                Cart_Status__c = 'Active'
            );
            insert cart;
            cartId = cart.Id;

            insert new Cart_Item__c(
                Shopping_Cart__c = cart.Id,
                Perfume__c = perfumeId,
                Quantity__c = 2,
                Unit_Price__c = 100
            );

            orderId = CheckoutController.placeOrder(
                '  Test Customer  ',
                '9876543210',
                '  Flat 12  ',
                '  MG Road  ',
                '  Near Park  ',
                '  Mumbai  ',
                '  Maharashtra  ',
                ' 400001 ',
                ' India '
            );
        }

        Customer_Order__c createdOrder = [
            SELECT Customer__c, Order_Date__c, Shipping_Address__c,
                   Total_Amount__c, Order_Status__c, Payment_Status__c
            FROM Customer_Order__c
            WHERE Id = :orderId
        ];
        System.assertEquals(testCustomer.contactId, createdOrder.Customer__c);
        System.assertEquals(Date.today(), createdOrder.Order_Date__c);
        System.assertEquals(200, createdOrder.Total_Amount__c);
        System.assertEquals('Pending', createdOrder.Order_Status__c);
        System.assertEquals('Pending', createdOrder.Payment_Status__c);
        System.assertEquals(
            'Name: Test Customer\n' +
            'Mobile: 9876543210\n' +
            'House/Flat: Flat 12\n' +
            'Street/Area: MG Road\n' +
            'Landmark: Near Park\n' +
            'City: Mumbai\n' +
            'State: Maharashtra\n' +
            'PIN Code: 400001\n' +
            'Country: India',
            createdOrder.Shipping_Address__c
        );

        List<Order_Item__c> orderItems = [
            SELECT Perfume__c, Quantity__c, Unit_Price__c
            FROM Order_Item__c
            WHERE Customer_Order__c = :orderId
        ];
        System.assertEquals(1, orderItems.size());
        System.assertEquals(perfumeId, orderItems[0].Perfume__c);
        System.assertEquals(2, orderItems[0].Quantity__c);
        System.assertEquals(100, orderItems[0].Unit_Price__c);

        Shopping_Cart__c convertedCart = [
            SELECT Cart_Status__c
            FROM Shopping_Cart__c
            WHERE Id = :cartId
        ];
        System.assertEquals('Converted', convertedCart.Cart_Status__c);
    }

    @IsTest
    static void testShippingAddressValidation() {
        assertPlaceOrderThrows(
            '',
            '9876543210',
            'Flat 12',
            'MG Road',
            '',
            'Mumbai',
            'Maharashtra',
            '400001',
            'India'
        );
        assertPlaceOrderThrows(
            'Test Customer',
            '1234567890',
            'Flat 12',
            'MG Road',
            '',
            'Mumbai',
            'Maharashtra',
            '400001',
            'India'
        );
        assertPlaceOrderThrows(
            'Test Customer',
            '9876543210',
            'Flat 12',
            'MG Road',
            '',
            'Mumbai',
            'Maharashtra',
            '012345',
            'India'
        );
        assertPlaceOrderThrows(
            'Test Customer',
            '9876543210',
            'Flat 12',
            'MG Road',
            '',
            'Mumbai',
            'Maharashtra',
            '400001',
            'USA'
        );
    }

    @IsTest
    static void testPlaceOrderRequiresCustomerContact() {
        TestCustomer testCustomer = createCustomer();
        System.runAs(testCustomer.owner) {
            assertValidAddressThrows();
        }
    }

    @IsTest
    static void testPlaceOrderRequiresCartOrPendingOrder() {
        TestCustomer testCustomer = createCustomer();
        System.runAs(testCustomer.customer) {
            assertValidAddressThrows();
        }
    }

    @IsTest
    static void testPlaceOrderReusesPendingOrderWhenCartIsMissing() {
        TestCustomer testCustomer = createCustomer();
        Id existingOrderId;
        Id returnedOrderId;

        System.runAs(testCustomer.customer) {
            Customer_Order__c pendingOrder = new Customer_Order__c(
                Customer__c = testCustomer.contactId,
                Order_Date__c = Date.today(),
                Total_Amount__c = 100,
                Order_Status__c = 'Pending',
                Payment_Status__c = 'Pending'
            );
            insert pendingOrder;
            existingOrderId = pendingOrder.Id;

            returnedOrderId = CheckoutController.placeOrder(
                'Test Customer',
                '9876543210',
                'Flat 12',
                'MG Road',
                '',
                'Mumbai',
                'Maharashtra',
                '400001',
                'India'
            );
        }

        System.assertEquals(existingOrderId, returnedOrderId);
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Customer_Order__c WHERE Customer__c = :testCustomer.contactId]
        );
    }

    @IsTest
    static void testPlaceOrderRejectsEmptyCart() {
        TestCustomer testCustomer = createCustomer();

        System.runAs(testCustomer.customer) {
            insert new Shopping_Cart__c(
                Customer__c = testCustomer.contactId,
                Cart_Status__c = 'Active'
            );
            assertValidAddressThrows();
        }
    }

    @IsTest
    static void testPlaceOrderRejectsUnavailablePerfume() {
        TestCustomer testCustomer = createCustomer();
        Id perfumeId = getPerfumeId(INACTIVE_PERFUME);

        System.runAs(testCustomer.customer) {
            Shopping_Cart__c cart = new Shopping_Cart__c(
                Customer__c = testCustomer.contactId,
                Cart_Status__c = 'Active'
            );
            insert cart;
            insert new Cart_Item__c(
                Shopping_Cart__c = cart.Id,
                Perfume__c = perfumeId,
                Quantity__c = 1,
                Unit_Price__c = 100
            );
            assertValidAddressThrows();
        }
    }

    @IsTest
    static void testPlaceOrderRejectsInsufficientStock() {
        TestCustomer testCustomer = createCustomer();
        Id perfumeId = getPerfumeId(ACTIVE_PERFUME);

        System.runAs(testCustomer.customer) {
            Shopping_Cart__c cart = new Shopping_Cart__c(
                Customer__c = testCustomer.contactId,
                Cart_Status__c = 'Active'
            );
            insert cart;
            insert new Cart_Item__c(
                Shopping_Cart__c = cart.Id,
                Perfume__c = perfumeId,
                Quantity__c = 6,
                Unit_Price__c = 100
            );
            assertValidAddressThrows();
        }
    }
}
