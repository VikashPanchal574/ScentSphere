@IsTest
private class FeaturedFragrancesControllerTest {

    private static User createAdminUser(String suffix) {
        Profile adminProfile = [
            SELECT Id
            FROM Profile
            WHERE PermissionsModifyAllData = true
            LIMIT 1
        ];
        String uniqueValue = String.valueOf(DateTime.now().getTime()) + suffix;
        User admin = new User(
            Alias = 'feat' + suffix,
            Email = 'featuredtest' + uniqueValue + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester' + suffix,
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = adminProfile.Id,
            UserName = 'featuredtest' + uniqueValue + '@example.com'
        );
        insert admin;
        return admin;
    }

    private static Perfume__c buildPerfume(
        String productName,
        Boolean active,
        Boolean featured
    ) {
        return new Perfume__c(
            Product_Name__c = productName,
            Brand__c = 'Dior',
            Category__c = 'Floral',
            Price__c = 4999,
            Size__c = '100 ml',
            Description__c = 'Test description',
            Product_Image_URL__c = 'https://example.com/image.jpg',
            Stock_Quantity__c = 25,
            Active__c = active,
            Featured_Product__c = featured
        );
    }

    @TestSetup
    static void setup() {
        insert new List<Perfume__c>{
            buildPerfume('Featured Active 1', true, true),
            buildPerfume('Featured Active 2', true, true),
            buildPerfume('Not Featured', true, false),
            buildPerfume('Inactive Featured', false, true),
            buildPerfume('Inactive Not Featured', false, false)
        };
    }

    @IsTest
    static void testGetFeaturedPerfumes_returnsOnlyActiveFeatured() {
        User admin = createAdminUser('a1');

        List<FeaturedFragrancesController.FeaturedPerfume> results;
        Test.startTest();
        System.runAs(admin) {
            results = FeaturedFragrancesController.getFeaturedPerfumes();
        }
        Test.stopTest();

        System.assertEquals(2, results.size(), 'Only active and featured perfumes should be returned');

        Set<String> productNames = new Set<String>();
        for (FeaturedFragrancesController.FeaturedPerfume perfume : results) {
            productNames.add(perfume.productName);
        }
        System.assert(productNames.contains('Featured Active 1'));
        System.assert(productNames.contains('Featured Active 2'));
        System.assert(!productNames.contains('Not Featured'));
        System.assert(!productNames.contains('Inactive Featured'));
        System.assert(!productNames.contains('Inactive Not Featured'));
    }

    @IsTest
    static void testGetFeaturedPerfumes_mapsFieldsCorrectly() {
        User admin = createAdminUser('a2');

        List<FeaturedFragrancesController.FeaturedPerfume> results;
        System.runAs(admin) {
            results = FeaturedFragrancesController.getFeaturedPerfumes();
        }

        FeaturedFragrancesController.FeaturedPerfume featuredPerfume;
        for (FeaturedFragrancesController.FeaturedPerfume perfume : results) {
            if (perfume.productName == 'Featured Active 1') {
                featuredPerfume = perfume;
                break;
            }
        }

        System.assertNotEquals(null, featuredPerfume, 'Expected the test featured perfume');
        System.assertNotEquals(null, featuredPerfume.Id, 'Id should be mapped');
        System.assert(featuredPerfume.Name.startsWith('PRD-'), 'Auto-number name should be mapped');
        System.assertEquals('Featured Active 1', featuredPerfume.productName);
        System.assertEquals('Dior', featuredPerfume.brand);
        System.assertEquals('Floral', featuredPerfume.category);
        System.assertEquals(4999, featuredPerfume.price);
        System.assertEquals('100 ml', featuredPerfume.size);
        System.assertEquals('Test description', featuredPerfume.description);
        System.assertEquals('https://example.com/image.jpg', featuredPerfume.imageUrl);
        System.assertEquals(25, featuredPerfume.stockQuantity);
    }

    @IsTest
    static void testGetFeaturedPerfumes_noFeaturedRecords() {
        User admin = createAdminUser('a3');

        List<FeaturedFragrancesController.FeaturedPerfume> results;
        Test.startTest();
        System.runAs(admin) {
            delete [
                SELECT Id
                FROM Perfume__c
                WHERE Featured_Product__c = true
            ];
            results = FeaturedFragrancesController.getFeaturedPerfumes();
        }
        Test.stopTest();

        System.assertNotEquals(null, results, 'Result list should never be null');
        System.assertEquals(0, results.size(), 'No featured perfumes should be returned');
    }
}
