
public with sharing class CheckoutController {

    @AuraEnabled
    public static Id placeOrder(String fullName,
    String mobileNumber,
    String houseNumber,
    String streetArea,
    String landmark,
    String city,
    String shippingState,
    String pinCode,
    String country) {

        Savepoint sp = Database.setSavepoint();

        try {
           // 1. Validate shipping address fields
if (
    String.isBlank(fullName) ||
    String.isBlank(mobileNumber) ||
    String.isBlank(houseNumber) ||
    String.isBlank(streetArea) ||
    String.isBlank(city) ||
    String.isBlank(shippingState) ||
    String.isBlank(pinCode) ||
    String.isBlank(country)
) {
    throw new AuraHandledException(
        'Please complete all required shipping fields.'
    );
}

if (!Pattern.matches('^[6-9][0-9]{9}$', mobileNumber.trim())) {
    throw new AuraHandledException(
        'Please enter a valid 10-digit mobile number.'
    );
}

if (!Pattern.matches('^[1-9][0-9]{5}$', pinCode.trim())) {
    throw new AuraHandledException(
        'Please enter a valid 6-digit PIN code.'
    );
}

if (country.trim() != 'India') {
    throw new AuraHandledException(
        'Currently, delivery is available in India only.'
    );
}

// Build formatted shipping address
List<String> addressLines = new List<String>{
    'Name: ' + fullName.trim(),
    'Mobile: ' + mobileNumber.trim(),
    'House/Flat: ' + houseNumber.trim(),
    'Street/Area: ' + streetArea.trim()
};

if (!String.isBlank(landmark)) {
    addressLines.add('Landmark: ' + landmark.trim());
}

addressLines.add('City: ' + city.trim());
addressLines.add('State: ' + shippingState.trim());
addressLines.add('PIN Code: ' + pinCode.trim());
addressLines.add('Country: ' + country.trim());

String formattedShippingAddress =
    String.join(addressLines, '\n');

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
                Shipping_Address__c = formattedShippingAddress,
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

    // Read the logged-in customer's most recent shipping address.
    // This method does not create or update any records.
    @AuraEnabled
    public static String getLastShippingAddress() {

        List<User> users = [
            SELECT ContactId
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        if (users.isEmpty() || users[0].ContactId == null) {
            return null;
        }

        Id contactId = users[0].ContactId;

        List<Customer_Order__c> previousOrders = [
            SELECT Shipping_Address__c
            FROM Customer_Order__c
            WHERE Customer__c = :contactId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 10
        ];

        for (Customer_Order__c orderRecord : previousOrders) {
            if (!String.isBlank(orderRecord.Shipping_Address__c)) {
                return orderRecord.Shipping_Address__c;
            }
        }

        return null;
    }

}
