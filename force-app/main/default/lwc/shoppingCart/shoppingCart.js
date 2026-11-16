
import { LightningElement, wire } from 'lwc';

import {
    NavigationMixin,
    CurrentPageReference
} from 'lightning/navigation';

import { MessageContext, publish } from 'lightning/messageService';

import isGuestUser from '@salesforce/user/isGuest';

import CART_UPDATE from '@salesforce/messageChannel/CartUpdate__c';

import updateQuantity from '@salesforce/apex/CartController.updateQuantity';
import removeCartItem from '@salesforce/apex/CartController.removeCartItem';
import getCartFresh from '@salesforce/apex/CartController.getCartFresh';

export default class ShoppingCart extends NavigationMixin(LightningElement) {

    cart;
    cartItems = [];

    isGuest = isGuestUser;

    isLoading = !isGuestUser;
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

    // ==========================================
    // GUEST USER
    // ==========================================

    get showGuestMessage() {
        return this.isGuest && !this.isLoading;
    }

    handleLogin() {

        this[NavigationMixin.Navigate]({
            type: 'comm__loginPage',
            attributes: {
                actionName: 'login'
            }
        });
    }

    // ==========================================
    // LOAD CART WITH STOCK INFORMATION
    // ==========================================

    async loadCart() {

        if (this.isGuest) {
            this.cart = undefined;
            this.cartItems = [];
            this.errorMessage = '';
            this.isLoading = false;
            return;
        }

        this.isLoading = true;

        try {

            const data = await getCartFresh();

            this.cart = data?.cart;

            this.cartItems = (data?.items || []).map(item => {

                const perfume = item.Perfume__r;

                const rawStock = perfume?.Stock_Quantity__c;

                const stockQuantity = Number(rawStock);

                const stockKnown =
                    rawStock !== null &&
                    rawStock !== undefined &&
                    Number.isFinite(stockQuantity);

                const isActive = perfume?.Active__c === true;

                const requestedQuantity = Number(
                    item.Quantity__c || 0
                );

                let stockWarning = '';

                // Inactive Perfume
                if (!isActive) {
                    stockWarning = 'Currently unavailable';
                }

                // No Stock
                else if (!stockKnown || stockQuantity <= 0) {
                    stockWarning = 'Out of Stock';
                }

                // Requested Quantity Exceeds Stock
                else if (requestedQuantity > stockQuantity) {
                    stockWarning =
                        `Only ${stockQuantity} left in stock. Please reduce quantity.`;
                }

                return {
                    ...item,

                    productName: perfume?.Product_Name__c,

                    imageUrl: perfume?.Product_Image_URL__c,

                    stockQuantity,

                    stockWarning,

                    canIncrease:
                        isActive &&
                        stockKnown &&
                        requestedQuantity < stockQuantity,

                    formattedPrice: this.formatCurrency(
                        item.Unit_Price__c
                    ),

                    formattedSubtotal: this.formatCurrency(
                        item.Subtotal__c
                    )
                };
            });

            this.errorMessage = '';

        } catch (error) {

            this.cart = undefined;
            this.cartItems = [];

            this.errorMessage =
                error?.body?.message ||
                error?.message ||
                'Unable to load your shopping cart.';

            console.error('Cart Loading Error:', error);

        } finally {
            this.isLoading = false;
        }
    }

    // ==========================================
    // CHECKOUT - RECHECK STOCK
    // ==========================================

    async handleCheckout() {

        if (this.isGuest) {
            this.handleLogin();
            return;
        }

        if (this.checkoutDisabled) {
            return;
        }

        this.isUpdating = true;

        try {

            // Fetch fresh inventory before navigation
            await this.loadCart();

            if (
                this.errorMessage ||
                !this.hasItems ||
                this.hasStockIssue
            ) {
                return;
            }

            this[NavigationMixin.Navigate]({
                type: 'comm__namedPage',
                attributes: {
                    name: 'Checkout__c'
                }
            });

        } finally {
            this.isUpdating = false;
        }
    }

    // ==========================================
    // CART UPDATE MESSAGE
    // ==========================================

    notifyCartUpdate() {

        if (this.messageContext) {
            publish(
                this.messageContext,
                CART_UPDATE,
                { updated: true }
            );
        }
    }

    // ==========================================
    // CURRENCY FORMATTING
    // ==========================================

    formatCurrency(amount) {

        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    // ==========================================
    // GETTERS
    // ==========================================

    get hasItems() {
        return this.cartItems.length > 0;
    }

    // Check if any item has stock issues
    get hasStockIssue() {
        return this.cartItems.some(
            item => Boolean(item.stockWarning)
        );
    }

    // Disable checkout when inventory invalid
    get checkoutDisabled() {

        return this.isGuest ||
            this.isLoading ||
            this.isUpdating ||
            Boolean(this.errorMessage) ||
            !this.hasItems ||
            this.hasStockIssue;
    }

    // Per-item quantity button states
    get displayCartItems() {

        return this.cartItems.map(item => ({
            ...item,

            disableIncrease:
                this.isUpdating || !item.canIncrease,

            disableDecrease:
                this.isUpdating ||
                Number(item.Quantity__c) <= 1
        }));
    }

    get isEmpty() {

        return !this.isGuest &&
            !this.isLoading &&
            !this.errorMessage &&
            !this.hasItems;
    }

    get formattedTotal() {
        return this.formatCurrency(
            this.cart?.Total_Amount__c
        );
    }

    // ==========================================
    // INCREASE QUANTITY
    // ==========================================

    async handleIncrease(event) {

        if (this.isGuest) {
            return;
        }

        const itemId = event.currentTarget.dataset.id;

        const item = this.cartItems.find(
            row => row.Id === itemId
        );

        if (
            item &&
            item.canIncrease &&
            !this.isUpdating
        ) {
            await this.changeQuantity(
                itemId,
                Number(item.Quantity__c) + 1
            );
        }
    }

    // ==========================================
    // DECREASE QUANTITY
    // ==========================================

    async handleDecrease(event) {

        if (this.isGuest) {
            return;
        }

        const itemId = event.currentTarget.dataset.id;

        const item = this.cartItems.find(
            row => row.Id === itemId
        );

        if (
            item &&
            Number(item.Quantity__c) > 1 &&
            !this.isUpdating
        ) {
            await this.changeQuantity(
                itemId,
                Number(item.Quantity__c) - 1
            );
        }
    }

    // ==========================================
    // CHANGE QUANTITY
    // ==========================================

    async changeQuantity(itemId, quantity) {

        if (this.isGuest) {
            return;
        }

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

    // ==========================================
    // REMOVE CART ITEM
    // ==========================================

    async handleRemove(event) {

        if (this.isGuest) {
            return;
        }

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

    // ==========================================
    // CONTINUE SHOPPING
    // ==========================================

    handleContinueShopping() {
        window.location.assign('/scentsphere/shop');
    }
}
