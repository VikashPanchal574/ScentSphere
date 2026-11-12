import { LightningElement, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { MessageContext, publish } from 'lightning/messageService';

import CART_UPDATE from '@salesforce/messageChannel/CartUpdate__c';

import updateQuantity from '@salesforce/apex/CartController.updateQuantity';
import removeCartItem from '@salesforce/apex/CartController.removeCartItem';
import getCartFresh from '@salesforce/apex/CartController.getCartFresh';

export default class ShoppingCart extends NavigationMixin(LightningElement) {

    cart;
    cartItems = [];

    isLoading = true;
    errorMessage = '';
    isUpdating = false;

    lastPageReference;

    @wire(MessageContext)
    messageContext;

    @wire(CurrentPageReference)
    handlePageReference(pageReference) {
        if (!pageReference) {
            return;
        }

        const pageKey = JSON.stringify(pageReference);

        if (pageKey !== this.lastPageReference) {
            this.lastPageReference = pageKey;
            this.loadCart();
        }
    }

    async loadCart() {
        this.isLoading = true;

        try {
            const data = await getCartFresh();

            this.cart = data?.cart;
            this.cartItems = (data?.items || []).map(item => ({
                ...item,
                productName: item.Perfume__r?.Product_Name__c,
                imageUrl: item.Perfume__r?.Product_Image_URL__c,
                formattedPrice: this.formatCurrency(item.Unit_Price__c),
                formattedSubtotal: this.formatCurrency(item.Subtotal__c)
            }));

            this.errorMessage = '';

        } catch (error) {
            this.cart = undefined;
            this.cartItems = [];

            this.errorMessage =
                error?.body?.message ||
                'Unable to load your shopping cart.';

        } finally {
            this.isLoading = false;
        }
    }

    handleCheckout() {
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'Checkout__c'
            }
        });
    }

    notifyCartUpdate() {
        publish(this.messageContext, CART_UPDATE, { updated: true });
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    get hasItems() {
        return this.cartItems.length > 0;
    }

    get isEmpty() {
        return !this.isLoading &&
            !this.errorMessage &&
            !this.hasItems;
    }

    get formattedTotal() {
        return this.formatCurrency(this.cart?.Total_Amount__c);
    }

    async handleIncrease(event) {
        const itemId = event.currentTarget.dataset.id;
        const item = this.cartItems.find(row => row.Id === itemId);

        if (item) {
            await this.changeQuantity(
                itemId,
                item.Quantity__c + 1
            );
        }
    }

    async handleDecrease(event) {
        const itemId = event.currentTarget.dataset.id;
        const item = this.cartItems.find(row => row.Id === itemId);

        if (item && item.Quantity__c > 1) {
            await this.changeQuantity(
                itemId,
                item.Quantity__c - 1
            );
        }
    }

    async changeQuantity(itemId, quantity) {
        this.isUpdating = true;
        this.errorMessage = '';

        try {
            await updateQuantity({
                cartItemId: itemId,
                quantity: quantity
            });

            await this.loadCart();
            this.notifyCartUpdate();

        } catch (error) {
            this.errorMessage =
                error?.body?.message ||
                'Unable to update quantity.';

        } finally {
            this.isUpdating = false;
        }
    }

    async handleRemove(event) {
        const itemId = event.currentTarget.dataset.id;

        this.isUpdating = true;
        this.errorMessage = '';

        try {
            await removeCartItem({
                cartItemId: itemId
            });

            await this.loadCart();
            this.notifyCartUpdate();

        } catch (error) {
            this.errorMessage =
                error?.body?.message ||
                'Unable to remove this item.';

        } finally {
            this.isUpdating = false;
        }
    }

    handleContinueShopping() {
        window.location.assign('/scentsphere/shop');
    }
}