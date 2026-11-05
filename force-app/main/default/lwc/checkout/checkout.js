import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import placeOrder from '@salesforce/apex/CheckoutController.placeOrder';
import getCart from '@salesforce/apex/CartController.getCart';

export default class Checkout extends NavigationMixin(LightningElement) {

    shippingAddress = '';
    isPlacingOrder = false;
    errorMessage = '';

    cart;
    cartItems = [];

    @wire(getCart)
    wiredCart({ data, error }) {
        if (data) {
            this.cart = data.cart;
            this.cartItems = data.items || [];
            this.errorMessage = '';
        } else if (error) {
            this.cart = undefined;
            this.cartItems = [];
            this.errorMessage =
                error.body?.message || 'Unable to load your cart.';
        }
    }

    get totalItems() {
        return this.cart?.Total_Items__c || 0;
    }

    get formattedTotal() {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(this.cart?.Total_Amount__c || 0);
    }

    handleAddressChange(event) {
        this.shippingAddress = event.target.value;
        this.errorMessage = '';
    }

    async handlePlaceOrder() {

        const addressInput = this.template.querySelector(
            'lightning-textarea'
        );

        if (!addressInput.reportValidity()) {
            return;
        }

        if (!this.cartItems.length) {
            this.errorMessage = 'Your shopping cart is empty.';
            return;
        }

        this.isPlacingOrder = true;
        this.errorMessage = '';

        try {
            const orderId = await placeOrder({
                shippingAddress: this.shippingAddress
            });

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Order Placed!',
                    message: 'Your order has been created successfully.',
                    variant: 'success'
                })
            );

            this[NavigationMixin.Navigate]({
                type: 'comm__namedPage',
                attributes: {
                    name: 'Order_Confirmation__c'
                },
                state: {
                    c__orderId: orderId
                }
            });

        } catch (error) {
            this.errorMessage =
                error.body?.message ||
                'Unable to place your order. Please try again.';

        } finally {
            this.isPlacingOrder = false;
        }
    }
}
