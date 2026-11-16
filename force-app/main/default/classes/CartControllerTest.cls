@IsTest
private class CartControllerTest {

    // ------------------------------------------------------------------
    // CONFIGURATION - confirm these match your org
    // ------------------------------------------------------------------
    private static final String CUSTOMER_PROFILE_NAME = 'ScentSphere Customer User';

    // API names of EVERY permission set a real customer needs.
    // If Cart Items / Shopping Cart / Perfume access lives in separate
    // permission sets, add their API names here.
    private static final List<String> CUSTOMER_PERMISSION_SETS =
        new List<String>{ 'ScentSphere_Customer_Access' };

    private static final String ACTIVE_PERFUME   = 'Test Active Perfume';
    private static final String INACTIVE_PERFUME = 'Test Inactive Perfume';
    private static final String NO_STOCK_PERFUME = 'Test Out Of Stock Perfume';

    private class TestUsers {
        User owner;
        User customerA;
        User customerB;
    }

    // ------------------------------------------------------------------
    // TEST DATA
    // ------------------------------------------------------------------

    @TestSetup
    static void setupPerfumes() {
        // If Perfume__c has other required fields, validation rules, or a
        // required Name value, add them here.
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
            ),
            new Perfume__c(
                Product_Name__c = NO_STOCK_PERFUME,
                Brand__c = 'Dior',
                Size__c = '100 ml',
                Price__c = 100,
                Stock_Quantity__c = 0,
                Active__c = true
            )
        };
    }

    private static Perfume__c getPerfume(String productName) {
        return [
            SELECT Id, Stock_Quantity__c
            FROM Perfume__c
            WHERE Product_Name__c = :productName
            LIMIT 1
        ];
    }

    private static User buildUser(
        Id profileId, Id roleId, Id contactId,
        String alias, String username, String lastName
    ) {
        return new User(
            ProfileId = profileId,
            UserRoleId = roleId,
            ContactId = contactId,
            Alias = alias,
            Username = username,
            Email = username,
            LastName = lastName,
            CommunityNickname = alias + 'Nick',
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
    }

    /**
     * Builds an internal account owner (with a role, which Experience Cloud
     * users require), one Account, two Contacts, and two external customer
     * users. Setup DML (User, UserRole) and non-setup DML (Account, Contact)
     * are separated into different runAs blocks to avoid MIXED_DML_OPERATION.
     */
    private static TestUsers createTestUsers() {

        TestUsers t = new TestUsers();

        Id adminProfileId = [
            SELECT Id FROM Profile
            WHERE Name = 'System Administrator' LIMIT 1
        ].Id;

        Id customerProfileId = [
            SELECT Id FROM Profile
            WHERE Name = :CUSTOMER_PROFILE_NAME LIMIT 1
        ].Id;

        UserRole ownerRole = new UserRole(
            Name = 'ScentSphere Test Owner Role',
            DeveloperName = 'ScentSphere_Test_Owner_Role'
        );
        insert ownerRole;

        t.owner = buildUser(
            adminProfileId, ownerRole.Id, null,
            'cOwner', 'cart.owner@scentsphere-test.example.com',
            'CartOwner'
        );
        insert t.owner;

        Contact contactA;
        Contact contactB;

        System.runAs(t.owner) {
            Account acc = new Account(Name = 'ScentSphere Test Customers');
            insert acc;

            contactA = new Contact(
                AccountId = acc.Id, FirstName = 'Customer', LastName = 'Alpha'
            );
            contactB = new Contact(
                AccountId = acc.Id, FirstName = 'Customer', LastName = 'Bravo'
            );
            insert new List<Contact>{ contactA, contactB };
        }

        t.customerA = buildUser(
            customerProfileId, null, contactA.Id,
            'custA', 'cart.customer.a@scentsphere-test.example.com',
            'Alpha'
        );
        t.customerB = buildUser(
            customerProfileId, null, contactB.Id,
            'custB', 'cart.customer.b@scentsphere-test.example.com',
            'Bravo'
        );

        System.runAs(t.owner) {
            // Test.stopTest() runs any queueable/future jobs your User
            // trigger starts (e.g. automatic permission set assignment).
            Test.startTest();
            insert new List<User>{ t.customerA, t.customerB };
            Test.stopTest();
        }

        System.runAs(t.owner) {
            assignMissingPermissionSets(
                new List<User>{ t.customerA, t.customerB }
            );
        }

        return t;
    }

    /**
     * Assigns permission sets only if your User trigger/queueable has not
     * already done so, so the test never fails with a duplicate assignment.
     */
    private static void assignMissingPermissionSets(List<User> users) {

        Map<Id, PermissionSet> permissionSets = new Map<Id, PermissionSet>(
            [
                SELECT Id, Name FROM PermissionSet
                WHERE Name IN :CUSTOMER_PERMISSION_SETS
            ]
        );

        System.assertEquals(
            CUSTOMER_PERMISSION_SETS.size(),
            permissionSets.size(),
            'One or more permission set API names in CUSTOMER_PERMISSION_SETS do not exist.'
        );

        Set<String> existing = new Set<String>();
        for (PermissionSetAssignment psa : [
            SELECT AssigneeId, PermissionSetId
            FROM PermissionSetAssignment
            WHERE AssigneeId IN :users
            AND PermissionSetId IN :permissionSets.keySet()
        ]) {
            existing.add(psa.AssigneeId + ':' + psa.PermissionSetId);
        }

        List<PermissionSetAssignment> toInsert =
            new List<PermissionSetAssignment>();

        for (User u : users) {
            for (Id permissionSetId : permissionSets.keySet()) {
                if (!existing.contains(u.Id + ':' + permissionSetId)) {
                    toInsert.add(new PermissionSetAssignment(
                        AssigneeId = u.Id,
                        PermissionSetId = permissionSetId
                    ));
                }
            }
        }

        if (!toInsert.isEmpty()) {
            insert toInsert;
        }
    }

    // ------------------------------------------------------------------
    // ERROR-CAPTURE HELPERS (return the message, or null if no error)
    // ------------------------------------------------------------------

    private static String addError(Id perfumeId, Integer quantity) {
        try {
            CartController.addToCart(perfumeId, quantity);
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return null;
    }

    private static String updateError(Id itemId, Integer quantity) {
        try {
            CartController.updateQuantity(itemId, quantity);
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return null;
    }

    private static String removeError(Id itemId) {
        try {
            CartController.removeCartItem(itemId);
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return null;
    }

    private static String getCartError() {
        try {
            CartController.getCart();
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return null;
    }

    // ------------------------------------------------------------------
    // POSITIVE TESTS
    // ------------------------------------------------------------------

    @IsTest
    static void testCartLifecycle() {

        TestUsers t = createTestUsers();
        Perfume__c perfume = getPerfume(ACTIVE_PERFUME);

        System.runAs(t.customerA) {

            // No cart yet.
            CartController.CartResponse emptyResponse = CartController.getCart();
            System.assertEquals(null, emptyResponse.cart, 'No cart should exist yet.');
            System.assertEquals(0, emptyResponse.items.size());
            System.assertEquals(0, CartController.getCartCount(), 'Empty cart count should be zero.');

            // 1. Add.
            CartController.addToCart(perfume.Id, 1);
            System.assertEquals(1, CartController.getCartCount(), 'Cart count should include the new item.');

            // 2. Read.
            CartController.CartResponse response = CartController.getCart();
            System.assertNotEquals(null, response.cart, 'An active cart should be created.');
            System.assertEquals(1, response.items.size(), 'One item should be present.');

            Cart_Item__c item = response.items[0];
            System.assertEquals(1, item.Quantity__c, 'Initial quantity should be 1.');
            System.assertEquals(perfume.Id, item.Perfume__c);

            // 3. Update.
            CartController.updateQuantity(item.Id, 2);
            System.assertEquals(2, CartController.getCartCount(), 'Cart count should reflect the updated quantity.');
            CartController.CartResponse updated = CartController.getCart();
            System.assertEquals(2, updated.items[0].Quantity__c, 'Quantity should be 2.');

            // 4. Remove.
            CartController.removeCartItem(item.Id);
            System.assertEquals(0, CartController.getCartCount(), 'Removed items should not count.');
            CartController.CartResponse finalResponse = CartController.getCart();
            System.assertEquals(0, finalResponse.items.size(), 'Cart should be empty.');
        }
    }

    @IsTest
    static void testAddSamePerfumeTwiceMergesQuantity() {

        TestUsers t = createTestUsers();
        Perfume__c perfume = getPerfume(ACTIVE_PERFUME);

        System.runAs(t.customerA) {
            CartController.addToCart(perfume.Id, 2);
            CartController.addToCart(perfume.Id, 1);

            CartController.CartResponse response = CartController.getCart();
            System.assertEquals(1, response.items.size(), 'Same perfume must stay one line item.');
            System.assertEquals(3, response.items[0].Quantity__c);
        }
    }

    // ------------------------------------------------------------------
    // NEGATIVE TESTS - validation
    // ------------------------------------------------------------------

    @IsTest
    static void testAddToCartValidation() {

        TestUsers t = createTestUsers();
        Perfume__c active = getPerfume(ACTIVE_PERFUME);
        Perfume__c inactive = getPerfume(INACTIVE_PERFUME);
        Perfume__c noStock = getPerfume(NO_STOCK_PERFUME);

        System.runAs(t.customerA) {

            System.assertEquals(
                'Please provide a valid perfume and quantity.',
                addError(null, 1)
            );
            System.assertEquals(
                'Please provide a valid perfume and quantity.',
                addError(active.Id, 0)
            );
            System.assertEquals(
                'Please provide a valid perfume and quantity.',
                addError(active.Id, null)
            );
            System.assertEquals(
                'This perfume is unavailable.',
                addError(inactive.Id, 1)
            );
            System.assertEquals(
                'This perfume is out of stock.',
                addError(noStock.Id, 1)
            );
            System.assertEquals(
                'Requested quantity exceeds available stock.',
                addError(active.Id, 6)
            );

            // Existing line + new quantity must also respect stock (3 + 3 > 5).
            CartController.addToCart(active.Id, 3);
            System.assertEquals(
                'Requested quantity exceeds available stock.',
                addError(active.Id, 3)
            );
        }
    }

    @IsTest
    static void testUpdateAndRemoveValidation() {

        TestUsers t = createTestUsers();
        Perfume__c active = getPerfume(ACTIVE_PERFUME);

        System.runAs(t.customerA) {

            CartController.addToCart(active.Id, 1);
            Cart_Item__c item = CartController.getCart().items[0];

            System.assertEquals(
                'Please provide a valid quantity.',
                updateError(null, 1)
            );
            System.assertEquals(
                'Please provide a valid quantity.',
                updateError(item.Id, 0)
            );
            System.assertEquals(
                'Please provide a valid quantity.',
                updateError(item.Id, null)
            );
            System.assertEquals(
                'Requested quantity exceeds available stock.',
                updateError(item.Id, 6)
            );
            System.assertEquals(
                'Cart item ID is required.',
                removeError(null)
            );

            // Once removed, the item can no longer be updated or removed.
            CartController.removeCartItem(item.Id);

            System.assertEquals(
                'Cart item not found.',
                updateError(item.Id, 1)
            );
            System.assertEquals(
                'Cart item not found or access denied.',
                removeError(item.Id)
            );
        }
    }

    // ------------------------------------------------------------------
    // NEGATIVE TESTS - security
    // ------------------------------------------------------------------

    @IsTest
    static void testCustomerCannotTouchAnotherCustomersCart() {

        TestUsers t = createTestUsers();
        Perfume__c active = getPerfume(ACTIVE_PERFUME);

        // Customer A builds a cart.
        System.runAs(t.customerA) {
            CartController.addToCart(active.Id, 1);
        }

        Cart_Item__c itemOfA = [
            SELECT Id, Quantity__c FROM Cart_Item__c LIMIT 1
        ];

        // Customer B tries to read, update and delete A's item.
        System.runAs(t.customerB) {

            CartController.CartResponse responseB = CartController.getCart();
            System.assertEquals(null, responseB.cart, 'B must not see A\'s cart.');
            System.assertEquals(0, responseB.items.size());

            System.assertEquals(
                'Cart item not found.',
                updateError(itemOfA.Id, 2)
            );
            System.assertEquals(
                'Cart item not found or access denied.',
                removeError(itemOfA.Id)
            );

            // B can still create a cart of their own.
            CartController.addToCart(active.Id, 1);
        }

        // Verify with the test runner (system context): A's item is untouched
        // and the two customers have separate active carts.
        Cart_Item__c itemAfter = [
            SELECT Id, Quantity__c FROM Cart_Item__c WHERE Id = :itemOfA.Id
        ];
        System.assertEquals(1, itemAfter.Quantity__c, 'A\'s item must be unchanged.');

        List<Shopping_Cart__c> carts = [
            SELECT Id, Customer__c FROM Shopping_Cart__c
            WHERE Cart_Status__c = 'Active'
        ];
        System.assertEquals(2, carts.size(), 'Each customer should have exactly one active cart.');
        System.assertNotEquals(carts[0].Customer__c, carts[1].Customer__c);
    }

    @IsTest
    static void testUserWithoutContactIsRejected() {

        TestUsers t = createTestUsers();
        Perfume__c active = getPerfume(ACTIVE_PERFUME);

        // The internal owner has no ContactId, so it is not a customer.
        System.runAs(t.owner) {
            String expected = 'Your customer account is not properly configured.';
            System.assertEquals(expected, getCartError());
            System.assertEquals(expected, addError(active.Id, 1));
            System.assertEquals(expected, updateError(active.Id, 1));
            System.assertEquals(expected, removeError(active.Id));
        }
    }

    // NOTE: the Guest-user branch in getCurrentContactId() cannot be reliably
    // exercised from a test (a Guest User cannot be created with runAs in a
    // normal test). Verify it manually: open the public site while logged out.

@IsTest
static void testCartFreshReportsStockReducedToZero() {

    TestUsers t = createTestUsers();
    Perfume__c perfume = getPerfume(ACTIVE_PERFUME);

    System.runAs(t.customerA) {
        CartController.addToCart(perfume.Id, 1);
    }

    // Stock changes after adding to cart
    perfume.Stock_Quantity__c = 0;
    System.runAs(t.owner) {
        update perfume;
    }

    System.runAs(t.customerA) {

        CartController.CartResponse response =
            CartController.getCartFresh();

        System.assertEquals(
            1,
            response.items.size()
        );

        System.assertEquals(
            0,
            response.items[0].Perfume__r.Stock_Quantity__c
        );

        System.assertEquals(
            true,
            response.items[0].Perfume__r.Active__c
        );
    }
}

@IsTest
static void testCanReduceQuantityAfterStockDrops() {

    TestUsers t = createTestUsers();
    Perfume__c perfume = getPerfume(ACTIVE_PERFUME);

    Id cartItemId;

    System.runAs(t.customerA) {

        CartController.addToCart(perfume.Id, 5);

        cartItemId =
            CartController.getCartFresh().items[0].Id;
    }

    // Only 2 units remain
    perfume.Stock_Quantity__c = 2;
    System.runAs(t.owner) {
        update perfume;
    }

    System.runAs(t.customerA) {

        CartController.updateQuantity(cartItemId, 4);
        CartController.updateQuantity(cartItemId, 3);
        CartController.updateQuantity(cartItemId, 2);

        CartController.CartResponse response =
            CartController.getCartFresh();

        System.assertEquals(
            2,
            response.items[0].Quantity__c
        );

        System.assertEquals(
            'Requested quantity exceeds available stock.',
            updateError(cartItemId, 3)
        );
    }
}

}