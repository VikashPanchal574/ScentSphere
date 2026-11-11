import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import placeOrder from '@salesforce/apex/CheckoutController.placeOrder';
import getCart from '@salesforce/apex/CartController.getCart';

import createRazorpayPaymentLink from '@salesforce/apex/RazorpayPaymentController.createRazorpayPaymentLink';

// Site page that confirms the payment (same route Razorpay redirects to).
const PAYMENT_RETURN_PATH = '/scentsphere/payment-return';

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

        if (this.isPlacingOrder) {
            return;
        }

        this.isPlacingOrder = true;
        this.errorMessage = '';

        // Open the payment tab right now, inside the click, so the browser
        // does not block it. If it is blocked we fall back to a same-tab
        // redirect (the previous behaviour).
        let paymentWindow = null;
        try {
            paymentWindow = window.open('', '_blank');
        } catch (e) {
            paymentWindow = null;
        }

        try {

            // 1. Create Salesforce Customer Order
            const orderId = await placeOrder({
                shippingAddress: this.shippingAddress
            });

            // 2. Create Razorpay Payment Link
            const paymentLink = await createRazorpayPaymentLink({
                customerOrderId: orderId
            });

            if (
                !paymentLink ||
                !paymentLink.paymentLinkUrl ||
                !paymentLink.paymentLinkUrl.startsWith('https://rzp.io/')
            ) {
                throw new Error('Invalid Razorpay payment link received.');
            }

            // 3. Inform customer
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Order Created',
                    message: 'Redirecting to secure Razorpay payment...',
                    variant: 'success'
                })
            );

            // 4. Send the customer to the Razorpay hosted payment page
            let openedInNewTab = false;

            if (paymentWindow && paymentLink.paymentLinkId) {
                try {
                    paymentWindow.location.href = paymentLink.paymentLinkUrl;
                    openedInNewTab = true;
                } catch (e) {
                    openedInNewTab = false;
                    this.closeWindow(paymentWindow);
                }
            }

            if (openedInNewTab) {
                // This tab waits and confirms the payment automatically.
                window.location.assign(
                    PAYMENT_RETURN_PATH +
                    '?razorpay_payment_link_id=' +
                    encodeURIComponent(paymentLink.paymentLinkId)
                );
            } else {
                this.closeWindow(paymentWindow);
                window.location.assign(paymentLink.paymentLinkUrl);
            }

        } catch (error) {

            this.closeWindow(paymentWindow);

            this.errorMessage =
                error.body?.message ||
                error.message ||
                'Unable to initiate payment. Please try again.';

            this.isPlacingOrder = false;

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Checkout Error',
                    message: this.errorMessage,
                    variant: 'error'
                })
            );
        }
    }

    closeWindow(win) {
        try {
            if (win) {
                win.close();
            }
        } catch (e) {
            // Nothing to do if the window cannot be closed.
        }
    }
}