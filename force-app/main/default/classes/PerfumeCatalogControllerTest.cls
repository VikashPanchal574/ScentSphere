@IsTest
private class PerfumeCatalogControllerTest {

    private static User createAdminUser(String suffix) {
        Profile adminProfile = [
            SELECT Id
            FROM Profile
            WHERE PermissionsModifyAllData = true
            LIMIT 1
        ];
        String uniqueValue = String.valueOf(DateTime.now().getTime()) + suffix;
        User admin = new User(
            Alias = 'cat' + suffix,
            Email = 'catalogtest' + uniqueValue + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'CatalogTester' + suffix,
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = adminProfile.Id,
            UserName = 'catalogtest' + uniqueValue + '@example.com'
        );
        insert admin;
        return admin;
    }

    private static User createStandardUser(String suffix) {
        Profile standardProfile = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Standard User'
            LIMIT 1
        ];
        String uniqueValue = String.valueOf(DateTime.now().getTime()) + suffix;
        User standardUser = new User(
            Alias = 'std' + suffix,
            Email = 'catalogstandard' + uniqueValue + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'StandardTester' + suffix,
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'Asia/Kolkata',
            ProfileId = standardProfile.Id,
            UserName = 'catalogstandard' + uniqueValue + '@example.com'
        );
        insert standardUser;
        return standardUser;
    }

    private static Perfume__c buildPerfume(
        String productName,
        Boolean active,
        Boolean featured,
        String giftCollection
    ) {
        return new Perfume__c(
            Product_Name__c = productName,
            Brand__c = 'Dior',
            Category__c = 'Floral',
            Gender__c = 'Men',
            Price__c = 2499,
            Size__c = '100 ml',
            Description__c = 'Catalog test description',
            Product_Image_URL__c = 'https://example.com/catalog.jpg',
            Stock_Quantity__c = 12,
            Active__c = active,
            Featured_Product__c = featured,
            Gift_Collection__c = giftCollection
        );
    }

    @TestSetup
    static void setupPerfumes() {
        insert new List<Perfume__c>{
            buildPerfume('Catalog Active Featured', true, true, null),
            buildPerfume('Catalog Active Regular', true, false, null),
            buildPerfume('Catalog Inactive', false, true, null),
            buildPerfume(
                'Catalog Gift',
                true,
                true,
                'Special Moments'
            )
        };
    }

    @IsTest
    static void testGetActivePerfumesFiltersAndMapsFields() {
        User admin = createAdminUser('a1');

        List<Perfume__c> perfumes;
        Test.startTest();
        System.runAs(admin) {
            perfumes = PerfumeCatalogController.getActivePerfumes();
        }
        Test.stopTest();

        System.assertEquals(2, perfumes.size());
        Set<String> productNames = new Set<String>();
        for (Perfume__c perfume : perfumes) {
            productNames.add(perfume.Product_Name__c);
        }
        System.assert(productNames.contains('Catalog Active Featured'));
        System.assert(productNames.contains('Catalog Active Regular'));
        System.assert(!productNames.contains('Catalog Inactive'));
        System.assert(!productNames.contains('Catalog Gift'));

        Perfume__c featuredPerfume;
        for (Perfume__c perfume : perfumes) {
            if (perfume.Product_Name__c == 'Catalog Active Featured') {
                featuredPerfume = perfume;
                break;
            }
        }

        System.assertNotEquals(null, featuredPerfume);
        System.assertNotEquals(null, featuredPerfume.Id);
        System.assertNotEquals(null, featuredPerfume.Name);
        System.assertEquals('Dior', featuredPerfume.Brand__c);
        System.assertEquals('Floral', featuredPerfume.Category__c);
        System.assertEquals('Men', featuredPerfume.Gender__c);
        System.assertEquals(2499, featuredPerfume.Price__c);
        System.assertEquals('100 ml', featuredPerfume.Size__c);
        System.assertEquals('Catalog test description', featuredPerfume.Description__c);
        System.assertEquals(
            'https://example.com/catalog.jpg',
            featuredPerfume.Product_Image_URL__c
        );
        System.assertEquals(12, featuredPerfume.Stock_Quantity__c);
        System.assertEquals(true, featuredPerfume.Featured_Product__c);
    }

    @IsTest
    static void testGetActivePerfumesReturnsEmptyWhenNoNormalActivePerfumes() {
        User admin = createAdminUser('a2');

        List<Perfume__c> perfumes;
        System.runAs(admin) {
            delete [
                SELECT Id
                FROM Perfume__c
                WHERE Active__c = true
                AND Gift_Collection__c = null
            ];
            perfumes = PerfumeCatalogController.getActivePerfumes();
        }

        System.assertNotEquals(null, perfumes);
        System.assertEquals(0, perfumes.size());
    }

    @IsTest
    static void testGetActivePerfumesHandlesMissingObjectAccess() {
        User standardUser = createStandardUser('n1');

        Boolean exceptionThrown = false;
        System.runAs(standardUser) {
            try {
                PerfumeCatalogController.getActivePerfumes();
            } catch (AuraHandledException e) {
                exceptionThrown = true;
            }
        }

        System.assert(
            exceptionThrown,
            'An AuraHandledException should be thrown when Perfume access is missing.'
        );
    }
}
