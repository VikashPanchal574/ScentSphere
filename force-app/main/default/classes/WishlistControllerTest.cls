@IsTest
private class WishlistControllerTest {

    private static final String ACTIVE_PERFUME = 'Wishlist Test Active';
    private static final String INACTIVE_PERFUME = 'Wishlist Test Inactive';

    @TestSetup
    static void setupPerfumes() {
        insert new List<Perfume__c>{
            new Perfume__c(
                Product_Name__c = ACTIVE_PERFUME,
                Brand__c = 'Dior',
                Category__c = 'Floral',
                Price__c = 200,
                Size__c = '100 ml',
                Stock_Quantity__c = 5,
                Active__c = true
            ),
            new Perfume__c(
                Product_Name__c = INACTIVE_PERFUME,
                Brand__c = 'Dior',
                Category__c = 'Floral',
                Price__c = 200,
                Size__c = '100 ml',
                Stock_Quantity__c = 5,
                Active__c = false
            )
        };
    }

    private static Id getPerfumeId(String productName) {
        return [
            SELECT Id
            FROM Perfume__c
            WHERE Product_Name__c = :productName
            LIMIT 1
        ].Id;
    }

    private static void assertAddThrows(Id perfumeId) {
        Boolean exceptionThrown = false;
        try {
            WishlistController.addToWishlist(perfumeId);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        System.assert(exceptionThrown, 'Expected an AuraHandledException.');
    }

    @IsTest
    static void testWishlistAddListIdsAndRemove() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('Wishlist');
        Id activePerfumeId = getPerfumeId(ACTIVE_PERFUME);

        System.runAs(customer.customer) {
            Test.startTest();
            Id wishlistItemId =
                WishlistController.addToWishlist(activePerfumeId);
            Id duplicateItemId =
                WishlistController.addToWishlist(activePerfumeId);
            List<Wishlist_Item__c> wishlist = WishlistController.getWishlist();
            List<Id> perfumeIds = WishlistController.getWishlistPerfumeIds();
            Boolean removed =
                WishlistController.removeFromWishlist(activePerfumeId);
            Test.stopTest();

            System.assertNotEquals(null, wishlistItemId);
            System.assertEquals(
                wishlistItemId,
                duplicateItemId,
                'Adding the same perfume must return the existing item.'
            );
            System.assertEquals(1, wishlist.size());
            System.assertEquals(activePerfumeId, wishlist[0].Perfume__c);
            System.assertEquals(
                new List<Id>{ activePerfumeId },
                perfumeIds
            );
            System.assertEquals(true, removed);
            System.assertEquals(0, WishlistController.getWishlist().size());
        }
    }

    @IsTest
    static void testWishlistRejectsNullAndInactivePerfumes() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('WishlistErrors');

        System.runAs(customer.customer) {
            assertAddThrows(null);
            assertAddThrows(getPerfumeId(INACTIVE_PERFUME));
        }
    }

    @IsTest
    static void testWishlistRequiresContact() {
        ScentSphereControllerTestData.CustomerContext customer =
            ScentSphereControllerTestData.createCustomer('WishlistNoContact');
        Boolean exceptionThrown = false;

        System.runAs(customer.owner) {
            try {
                WishlistController.getWishlist();
            } catch (AuraHandledException e) {
                exceptionThrown = true;
            }
        }

        System.assert(exceptionThrown, 'A user without a Contact must be rejected.');
    }
}
