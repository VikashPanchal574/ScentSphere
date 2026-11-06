
public with sharing class CheckoutController {

    @AuraEnabled
    public static Id placeOrder(String shippingAddress) {

        Savepoint sp = Database.setSavepoint();

        try {
            // 1. Validate shipping address
            if (String.isBlank(shippingAddress)) {
                throw new AuraHandledException(
                    'Please enter your shipping address.'
                );
            }

            // 2. Get logged-in customer's Contact Id
            User currentUser = [
                SELECT Id, ContactId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];

            if (currentUser.ContactId == null) {
                throw new AuraHandledException(
                    'Please sign in with a registered customer account.'
                );
            }

            Id contactId = currentUser.ContactId;

            // 3. Find customer's active cart
            List<Shopping_Cart__c> carts = [
                SELECT Id, Customer__c, Cart_Status__c,
                       Total_Amount__c, Total_Items__c
                FROM Shopping_Cart__c
                WHERE Customer__c = :contactId
                AND Cart_Status__c = 'Active'
                WITH USER_MODE
                LIMIT 1
            ];

            if (carts.isEmpty()) {

    // Reuse the customer's latest unpaid pending order
    List<Customer_Order__c> pendingOrders = [
        SELECT Id
        FROM Customer_Order__c
        WHERE Customer__c = :contactId
        AND Payment_Status__c = 'Pending'
        AND Order_Status__c = 'Pending'
        WITH USER_MODE
        ORDER BY CreatedDate DESC
        LIMIT 1
    ];

    if (!pendingOrders.isEmpty()) {
        return pendingOrders[0].Id;
    }

    throw new AuraHandledException(
        'No active shopping cart or pending order found.'
    );
}

            Shopping_Cart__c cart = carts[0];

            // 4. Fetch cart items and perfume details
            List<Cart_Item__c> cartItems = [
                SELECT Id, Perfume__c, Quantity__c, Unit_Price__c,
                       Perfume__r.Product_Name__c,
                       Perfume__r.Active__c,
                       Perfume__r.Stock_Quantity__c
                FROM Cart_Item__c
                WHERE Shopping_Cart__c = :cart.Id
                WITH USER_MODE
            ];

            if (cartItems.isEmpty()) {
                throw new AuraHandledException(
                    'Your shopping cart is empty.'
                );
            }

            // 5. Validate cart items
            for (Cart_Item__c item : cartItems) {

                if (item.Perfume__c == null ||
                    item.Perfume__r.Active__c != true) {

                    throw new AuraHandledException(
                        'One of the perfumes in your cart is unavailable.'
                    );
                }

                if (item.Quantity__c == null ||
                    item.Quantity__c <= 0) {

                    throw new AuraHandledException(
                        'Invalid quantity found in your cart.'
                    );
                }

                if (item.Unit_Price__c == null ||
                    item.Unit_Price__c <= 0) {

                    throw new AuraHandledException(
                        'Invalid perfume price found in your cart.'
                    );
                }

                if (item.Perfume__r.Stock_Quantity__c < item.Quantity__c) {
                    throw new AuraHandledException(
                        'Insufficient stock for ' +
                        item.Perfume__r.Product_Name__c
                    );
                }
            }

            // 6. Create Customer Order
            Customer_Order__c newOrder = new Customer_Order__c(
                Customer__c = contactId,
                Order_Date__c = Date.today(),
                Shipping_Address__c = shippingAddress.trim(),
                Total_Amount__c = cart.Total_Amount__c,
                Order_Status__c = 'Pending',
                Payment_Status__c = 'Pending'
            );

            insert newOrder;

            // 7. Create Order Items
            List<Order_Item__c> orderItems =
                new List<Order_Item__c>();

            for (Cart_Item__c item : cartItems) {

                orderItems.add(new Order_Item__c(
                    Customer_Order__c = newOrder.Id,
                    Perfume__c = item.Perfume__c,
                    Quantity__c = item.Quantity__c,
                    Unit_Price__c = item.Unit_Price__c
                ));
            }

            insert orderItems;

            // 8. Convert the shopping cart
            cart.Cart_Status__c = 'Converted';
            update cart;

            // 9. Return the newly created Order Id
            return newOrder.Id;

        } catch (AuraHandledException e) {

            Database.rollback(sp);
            throw e;

        } catch (Exception e) {

    Database.rollback(sp);

    System.debug(
        LoggingLevel.ERROR,
        'Checkout Error: ' + e.getMessage()
    );

    System.debug(
        LoggingLevel.ERROR,
        'Stack Trace: ' + e.getStackTraceString()
    );

    throw new AuraHandledException(
        'Checkout Debug: ' + e.getMessage()
    );
}
    }
}
