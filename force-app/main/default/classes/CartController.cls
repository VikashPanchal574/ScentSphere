public with sharing class CartController {

    // ==========================================
    // RESPONSE WRAPPER
    // ==========================================

    public class CartResponse {
        @AuraEnabled public Shopping_Cart__c cart { get; set; }
        @AuraEnabled public List<Cart_Item__c> items { get; set; }

        public CartResponse() {
            items = new List<Cart_Item__c>();
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * AuraHandledException.getMessage() returns the generic text
     * "Script-thrown exception" unless setMessage() is called.
     * This helper makes the real message visible to LWC and to tests.
     */
    private static AuraHandledException buildException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }

    /**
     * Writes the real (internal) error to the debug log only.
     * The user receives a friendly message, never the raw exception text.
     */
    private static void logError(String source, Exception e) {
        System.debug(
            LoggingLevel.ERROR,
            source + ' | ' + e.getTypeName() + ' | ' + e.getMessage()
                + ' | ' + e.getStackTraceString()
        );
    }

    // ==========================================
    // CUSTOMER VALIDATION
    // ==========================================

    private static Id getCurrentContactId() {

        if (UserInfo.getUserType() == 'Guest') {
            throw buildException(
                'Please sign in to access your shopping cart.'
            );
        }

        List<User> currentUsers = [
            SELECT Id, ContactId
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        if (currentUsers.isEmpty() ||
            currentUsers[0].ContactId == null) {

            throw buildException(
                'Your customer account is not properly configured.'
            );
        }

        return currentUsers[0].ContactId;
    }

    // ==========================================
    // GET OR CREATE ACTIVE CART
    // ==========================================

    private static Shopping_Cart__c getOrCreateActiveCart(
        Id contactId
    ) {

        List<Shopping_Cart__c> carts = [
            SELECT Id, Name, Customer__c,
                   Cart_Status__c,
                   Total_Amount__c,
                   Total_Items__c
            FROM Shopping_Cart__c
            WHERE Customer__c = :contactId
            AND Cart_Status__c = 'Active'
            WITH USER_MODE
            LIMIT 1
        ];

        if (!carts.isEmpty()) {
            return carts[0];
        }

        Shopping_Cart__c newCart = new Shopping_Cart__c(
            Customer__c = contactId,
            Cart_Status__c = 'Active'
        );

        Database.insert(newCart, AccessLevel.USER_MODE);

        return newCart;
    }

    // ==========================================
    // GET CART DETAILS
    // ==========================================

    @AuraEnabled(cacheable=true)
    public static CartResponse getCart() {

        try {

            Id contactId = getCurrentContactId();

            CartResponse response = new CartResponse();

            List<Shopping_Cart__c> carts = [
                SELECT Id, Name, Customer__c,
                       Cart_Status__c,
                       Total_Amount__c,
                       Total_Items__c
                FROM Shopping_Cart__c
                WHERE Customer__c = :contactId
                AND Cart_Status__c = 'Active'
                WITH USER_MODE
                LIMIT 1
            ];

            if (carts.isEmpty()) {
                return response;
            }

            response.cart = carts[0];

            response.items = [
                SELECT Id, Name,
                       Perfume__c,
                       Perfume__r.Product_Name__c,
                       Perfume__r.Product_Image_URL__c,
                       Quantity__c,
                       Unit_Price__c,
                       Subtotal__c
                FROM Cart_Item__c
                WHERE Shopping_Cart__c = :response.cart.Id
                WITH USER_MODE
                ORDER BY CreatedDate DESC
            ];

            return response;

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            logError('getCart', e);
            throw buildException(
                'Unable to load your shopping cart.'
            );
        }
    }

    // ==========================================
    // ADD PERFUME TO CART
    // ==========================================

    @AuraEnabled
    public static void addToCart(Id perfumeId, Integer quantity) {

        try {

            Id contactId = getCurrentContactId();

            if (perfumeId == null || quantity == null ||
                quantity <= 0) {

                throw buildException(
                    'Please provide a valid perfume and quantity.'
                );
            }

            List<Perfume__c> perfumes = [
                SELECT Id, Product_Name__c,
                       Price__c, Stock_Quantity__c,
                       Active__c
                FROM Perfume__c
                WHERE Id = :perfumeId
                AND Active__c = true
                WITH USER_MODE
                LIMIT 1
            ];

            if (perfumes.isEmpty()) {
                throw buildException(
                    'This perfume is unavailable.'
                );
            }

            Perfume__c perfume = perfumes[0];

            if (perfume.Price__c == null ||
                perfume.Stock_Quantity__c == null ||
                perfume.Stock_Quantity__c <= 0) {

                throw buildException(
                    'This perfume is out of stock.'
                );
            }

            Shopping_Cart__c cart =
                getOrCreateActiveCart(contactId);

            List<Cart_Item__c> existingItems = [
                SELECT Id, Quantity__c
                FROM Cart_Item__c
                WHERE Shopping_Cart__c = :cart.Id
                AND Perfume__c = :perfumeId
                WITH USER_MODE
                LIMIT 1
            ];

            if (!existingItems.isEmpty()) {

                Cart_Item__c existingItem = existingItems[0];

                Decimal currentQuantity = 0;
                if (existingItem.Quantity__c != null) {
                    currentQuantity = existingItem.Quantity__c;
                }

                Decimal updatedQuantity = currentQuantity + quantity;

                if (updatedQuantity > perfume.Stock_Quantity__c) {
                    throw buildException(
                        'Requested quantity exceeds available stock.'
                    );
                }

                // Update only the field that actually changes, so
                // user-mode FLS is checked for Quantity__c alone.
                Cart_Item__c itemToUpdate = new Cart_Item__c(
                    Id = existingItem.Id,
                    Quantity__c = updatedQuantity
                );

                Database.update(
                    itemToUpdate,
                    AccessLevel.USER_MODE
                );

            } else {

                if (quantity > perfume.Stock_Quantity__c) {
                    throw buildException(
                        'Requested quantity exceeds available stock.'
                    );
                }

                Cart_Item__c newItem = new Cart_Item__c(
                    Shopping_Cart__c = cart.Id,
                    Perfume__c = perfume.Id,
                    Quantity__c = quantity,
                    Unit_Price__c = perfume.Price__c
                );

                Database.insert(
                    newItem,
                    AccessLevel.USER_MODE
                );
            }

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            logError('addToCart', e);
            throw buildException(
                'Unable to add perfume to cart.'
            );
        }
    }

    // ==========================================
    // UPDATE CART ITEM QUANTITY
    // ==========================================

    @AuraEnabled
    public static void updateQuantity(
        Id cartItemId,
        Integer quantity
    ) {

        try {

            Id contactId = getCurrentContactId();

            if (cartItemId == null ||
                quantity == null ||
                quantity <= 0) {

                throw buildException(
                    'Please provide a valid quantity.'
                );
            }

            // Ownership is validated in the WHERE clause:
            // the item must belong to an Active cart of this customer.
            List<Cart_Item__c> items = [
                SELECT Id,
                       Quantity__c,
                       Perfume__c,
                       Perfume__r.Stock_Quantity__c
                FROM Cart_Item__c
                WHERE Id = :cartItemId
                AND Shopping_Cart__r.Customer__c = :contactId
                AND Shopping_Cart__r.Cart_Status__c = 'Active'
                WITH USER_MODE
                LIMIT 1
            ];

            if (items.isEmpty()) {
                throw buildException(
                    'Cart item not found.'
                );
            }

            Cart_Item__c item = items[0];

            if (item.Perfume__r == null ||
                item.Perfume__r.Stock_Quantity__c == null ||
                quantity > item.Perfume__r.Stock_Quantity__c) {

                throw buildException(
                    'Requested quantity exceeds available stock.'
                );
            }

            // Update only Quantity__c (not the queried lookup fields).
            Cart_Item__c itemToUpdate = new Cart_Item__c(
                Id = item.Id,
                Quantity__c = quantity
            );

            Database.update(itemToUpdate, AccessLevel.USER_MODE);

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            logError('updateQuantity', e);
            throw buildException(
                'Unable to update the cart item quantity.'
            );
        }
    }

    // ==========================================
    // REMOVE CART ITEM
    // ==========================================

    @AuraEnabled
    public static void removeCartItem(Id cartItemId) {

        try {

            Id contactId = getCurrentContactId();

            if (cartItemId == null) {
                throw buildException(
                    'Cart item ID is required.'
                );
            }

            List<Cart_Item__c> items = [
                SELECT Id
                FROM Cart_Item__c
                WHERE Id = :cartItemId
                AND Shopping_Cart__r.Customer__c = :contactId
                AND Shopping_Cart__r.Cart_Status__c = 'Active'
                WITH USER_MODE
                LIMIT 1
            ];

            if (items.isEmpty()) {
                throw buildException(
                    'Cart item not found or access denied.'
                );
            }

            Database.delete(items[0], AccessLevel.USER_MODE);

        } catch (AuraHandledException e) {
            throw e;

        } catch (Exception e) {
            logError('removeCartItem', e);
            throw buildException(
                'Unable to remove cart item.'
            );
        }
    }
}