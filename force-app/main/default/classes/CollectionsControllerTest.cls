@IsTest
private class CollectionsControllerTest {

    private static User createAdminUser(String suffix) {
        Profile adminProfile = [
            SELECT Id
            FROM Profile
            WHERE PermissionsModifyAllData = true
            LIMIT 1
        ];
        String uniqueValue = String.valueOf(DateTime.now().getTime()) + suffix;
        User admin = new User(
            Alias = 'coll' + suffix,
            Email = 'collectiontest' + uniqueValue + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'CollectionTester' + suffix,
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = adminProfile.Id,
            UserName = 'collectiontest' + uniqueValue + '@example.com'
        );
        insert admin;
        return admin;
    }

    private static Perfume__c buildPerfume(
        String productName,
        String category,
        Boolean active,
        Boolean featured,
        String giftCollection
    ) {
        return new Perfume__c(
            Product_Name__c = productName,
            Brand__c = 'Dior',
            Category__c = category,
            Description__c = 'Collection test perfume',
            Price__c = 100,
            Size__c = '100 ml',
            Stock_Quantity__c = 10,
            Active__c = active,
            Featured_Product__c = featured,
            Gift_Collection__c = giftCollection
        );
    }

    @TestSetup
    static void setupPerfumes() {
        insert new List<Perfume__c>{
            buildPerfume('A Floral Featured', 'Floral', true, true, null),
            buildPerfume('B Floral Basic', 'Floral', true, false, null),
            buildPerfume('C Citrus Basic', 'Citrus', true, false, null),
            buildPerfume('D Floral Inactive', 'Floral', false, true, null),
            buildPerfume(
                'E Gift for Her',
                'Floral',
                true,
                false,
                'Gifts for Her'
            ),
            buildPerfume(
                'F Gift for Him',
                'Citrus',
                true,
                false,
                'Gifts for Him'
            ),
            buildPerfume(
                'G Inactive Gift',
                'Floral',
                false,
                false,
                'Gifts for Her'
            )
        };
    }

    @IsTest
    static void testGetPerfumesByCategoryFiltersAndOrdersNormalPerfumes() {
        User admin = createAdminUser('a1');

        List<Perfume__c> perfumes;
        Test.startTest();
        System.runAs(admin) {
            perfumes = CollectionsController.getPerfumesByCategory('Floral');
        }
        Test.stopTest();

        System.assertEquals(2, perfumes.size());
        System.assertEquals('A Floral Featured', perfumes[0].Product_Name__c);
        System.assertEquals('B Floral Basic', perfumes[1].Product_Name__c);
        for (Perfume__c perfume : perfumes) {
            System.assertEquals('Floral', perfume.Category__c);
        }
        System.assertEquals('Dior', perfumes[0].Brand__c);
        System.assertEquals(10, perfumes[0].Stock_Quantity__c);
    }

    @IsTest
    static void testGetPerfumesByCategoryBlankAndAllReturnNormalActivePerfumes() {
        User admin = createAdminUser('a2');

        List<Perfume__c> blankResults;
        List<Perfume__c> allResults;
        System.runAs(admin) {
            blankResults = CollectionsController.getPerfumesByCategory('');
            allResults = CollectionsController.getPerfumesByCategory('All');
        }

        Set<String> expectedNames = new Set<String>{
            'A Floral Featured',
            'B Floral Basic',
            'C Citrus Basic'
        };
        Set<String> blankNames = new Set<String>();
        Set<String> allNames = new Set<String>();
        for (Perfume__c perfume : blankResults) {
            blankNames.add(perfume.Product_Name__c);
        }
        for (Perfume__c perfume : allResults) {
            allNames.add(perfume.Product_Name__c);
        }

        System.assertEquals(expectedNames, blankNames);
        System.assertEquals(expectedNames, allNames);
    }

    @IsTest
    static void testGetGiftPerfumesBlankAndAllReturnActiveAssignedGifts() {
        User admin = createAdminUser('a3');

        List<Perfume__c> blankResults;
        List<Perfume__c> allResults;
        System.runAs(admin) {
            blankResults = CollectionsController.getGiftPerfumes(null);
            allResults = CollectionsController.getGiftPerfumes('All');
        }

        System.assertEquals(2, blankResults.size());
        System.assertEquals(2, allResults.size());
        System.assertEquals('E Gift for Her', blankResults[0].Product_Name__c);
        System.assertEquals('F Gift for Him', blankResults[1].Product_Name__c);
        for (Perfume__c perfume : blankResults) {
            System.assertNotEquals(null, perfume.Gift_Collection__c);
        }
    }

    @IsTest
    static void testGetGiftPerfumesFiltersSpecificCollection() {
        User admin = createAdminUser('a4');

        List<Perfume__c> giftsForHer;
        List<Perfume__c> giftsForHim;
        List<Perfume__c> unknownCollection;
        Test.startTest();
        System.runAs(admin) {
            giftsForHer = CollectionsController.getGiftPerfumes('Gifts for Her');
            giftsForHim = CollectionsController.getGiftPerfumes('Gifts for Him');
            unknownCollection = CollectionsController.getGiftPerfumes('Unknown');
        }
        Test.stopTest();

        System.assertEquals(1, giftsForHer.size());
        System.assertEquals('E Gift for Her', giftsForHer[0].Product_Name__c);
        System.assertEquals(1, giftsForHim.size());
        System.assertEquals('F Gift for Him', giftsForHim[0].Product_Name__c);
        System.assertEquals(0, unknownCollection.size());
    }
}
