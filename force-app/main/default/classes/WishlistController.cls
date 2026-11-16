
public with sharing class WishlistController {

    // Get Contact Id of currently logged-in customer
    private static Id getCurrentContactId() {

        if (UserInfo.getUserType() == 'Guest') {
            throw new AuraHandledException(
                'Please login to access your wishlist.'
            );
        }

        User currentUser = [
            SELECT ContactId
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        if (currentUser.ContactId == null) {
            throw new AuraHandledException(
                'Your user account is not linked to a Contact.'
            );
        }

        return currentUser.ContactId;
    }


    // 1. Get complete wishlist
   
@AuraEnabled
public static List<Wishlist_Item__c> getWishlist() {

    Id contactId = getCurrentContactId();

    return [
        SELECT Id,
               Name,
               Customer__c,
               Perfume__c,
               Perfume__r.Product_Name__c,
               Perfume__r.Brand__c,
               Perfume__r.Price__c,
               Perfume__r.Product_Image_URL__c,
               Perfume__r.Category__c,
               Perfume__r.Active__c,
               Perfume__r.Stock_Quantity__c
        FROM Wishlist_Item__c
        WHERE Customer__c = :contactId
        WITH USER_MODE
        ORDER BY CreatedDate DESC
    ];
}



    // 2. Add perfume to wishlist
    @AuraEnabled
    public static Id addToWishlist(Id perfumeId) {

        if (perfumeId == null) {
            throw new AuraHandledException('Invalid perfume.');
        }

        Id contactId = getCurrentContactId();

        List<Perfume__c> perfumes = [
            SELECT Id, Active__c
            FROM Perfume__c
            WHERE Id = :perfumeId
            WITH USER_MODE
            LIMIT 1
        ];

        if (perfumes.isEmpty() || perfumes[0].Active__c != true) {
            throw new AuraHandledException(
                'This perfume is not available.'
            );
        }

        String wishlistKey =
            String.valueOf(contactId) + ':' +
            String.valueOf(perfumeId);

        // Check duplicate entry
        List<Wishlist_Item__c> existingItems = [
            SELECT Id
            FROM Wishlist_Item__c
            WHERE Wishlist_Key__c = :wishlistKey
            WITH USER_MODE
            LIMIT 1
        ];

        if (!existingItems.isEmpty()) {
            return existingItems[0].Id;
        }

        Wishlist_Item__c newItem = new Wishlist_Item__c();

        newItem.Customer__c = contactId;
        newItem.Perfume__c = perfumeId;
        newItem.Wishlist_Key__c = wishlistKey;

        try {

            Database.SaveResult result =
                Database.insert(newItem, AccessLevel.USER_MODE);

            return result.getId();

        } catch (DmlException e) {

            // Handle simultaneous duplicate requests
            List<Wishlist_Item__c> duplicateItems = [
                SELECT Id
                FROM Wishlist_Item__c
                WHERE Wishlist_Key__c = :wishlistKey
                WITH USER_MODE
                LIMIT 1
            ];

            if (!duplicateItems.isEmpty()) {
                return duplicateItems[0].Id;
            }

            throw new AuraHandledException(
                'Unable to add perfume to wishlist.'
            );
        }
    }


    // 3. Remove perfume from wishlist
    @AuraEnabled
    public static Boolean removeFromWishlist(Id perfumeId) {

        if (perfumeId == null) {
            throw new AuraHandledException('Invalid perfume.');
        }

        Id contactId = getCurrentContactId();

        List<Wishlist_Item__c> itemsToDelete = [
            SELECT Id
            FROM Wishlist_Item__c
            WHERE Customer__c = :contactId
            AND Perfume__c = :perfumeId
            WITH USER_MODE
            LIMIT 1
        ];

        if (!itemsToDelete.isEmpty()) {
            Database.delete(
                itemsToDelete,
                AccessLevel.USER_MODE
            );
        }

        return true;
    }


    // 4. Get all perfume IDs saved by current customer
    // Non-cacheable: Always fetch latest wishlist records
    @AuraEnabled
    public static List<Id> getWishlistPerfumeIds() {

        Id contactId = getCurrentContactId();

        List<Id> perfumeIds = new List<Id>();

        for (Wishlist_Item__c item : [
            SELECT Perfume__c
            FROM Wishlist_Item__c
            WHERE Customer__c = :contactId
            WITH USER_MODE
        ]) {
            perfumeIds.add(item.Perfume__c);
        }

        return perfumeIds;
    }
}
