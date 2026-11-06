import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadScript } from 'lightning/platformResourceLoader';

import RAZORPAY_CHECKOUT from '@salesforce/resourceUrl/razorpayCheckout';
import RAZORPAY_KEY_ID from '@salesforce/label/c.Razorpay_Key_Id';

import placeOrder from '@salesforce/apex/CheckoutController.placeOrder';
import getCart from '@salesforce/apex/CartController.getCart';

import createRazorpayOrder from '@salesforce/apex/RazorpayPaymentController.createRazorpayOrder';
import verifyRazorpayPayment from '@salesforce/apex/RazorpayPaymentController.verifyRazorpayPayment';

export default class Checkout extends NavigationMixin(LightningElement) {

    shippingAddress = '';
    isPlacingOrder = false;
    errorMessage = '';

    cart;
    cartItems = [];

    razorpayLoaded = false;

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

    async loadRazorpayScript() {
    if (this.razorpayLoaded) {
        return;
    }

    try {
        console.log('Razorpay script URL:', RAZORPAY_CHECKOUT);

        await loadScript(this, RAZORPAY_CHECKOUT);
        console.log('WINDOW:', typeof window.Razorpay);
console.log('GLOBAL:', typeof globalThis.Razorpay);
console.log('SELF:', typeof self.Razorpay);
console.log('DOCUMENT WINDOW:', typeof document.defaultView?.Razorpay);

        console.log('Razorpay script loaded successfully.');
        console.log('Razorpay object:', window.Razorpay);

        if (typeof window.Razorpay !== 'function') {
            throw new Error('Razorpay SDK loaded but constructor is unavailable.');
        }

        this.razorpayLoaded = true;

    } catch (error) {
        console.error('RAZORPAY SCRIPT ERROR:', error);
        console.error('ERROR MESSAGE:', error?.message);
        console.error('ERROR JSON:', JSON.stringify(error));

        throw error;
    }
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

        try {

            // 1. Create Salesforce Customer Order
            const orderId = await placeOrder({
                shippingAddress: this.shippingAddress
            });

            // 2. Create Razorpay Order through Apex
            const razorpayOrder = await createRazorpayOrder({
                customerOrderId: orderId
            });

            // 3. Load Razorpay Checkout JavaScript
            await this.loadRazorpayScript();

            if (!window.Razorpay) {
                throw new Error('Razorpay Checkout failed to load.');
            }

            // 4. Configure Razorpay Checkout
            const options = {
                key: RAZORPAY_KEY_ID,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currencyCode,
                name: 'ScentSphere',
                description: 'Payment for your perfume order',
                order_id: razorpayOrder.razorpayOrderId,

                theme: {
                    color: '#7B1E3A'
                },

                handler: async (response) => {

                    try {

                        // 5. Verify payment on Salesforce server
                        const verified = await verifyRazorpayPayment({
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id
                        });

                        if (verified !== true) {
                            throw new Error('Payment verification failed.');
                        }

                        this.dispatchEvent(
                            new ShowToastEvent({
                                title: 'Payment Successful!',
                                message: 'Your payment has been verified.',
                                variant: 'success'
                            })
                        );

                        // 6. Navigate only after server verification
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
                            error.message ||
                            'Payment verification failed.';

                        this.dispatchEvent(
                            new ShowToastEvent({
                                title: 'Verification Failed',
                                message: this.errorMessage,
                                variant: 'error'
                            })
                        );

                    } finally {
                        this.isPlacingOrder = false;
                    }
                },

                modal: {
                    ondismiss: () => {
                        this.isPlacingOrder = false;

                        this.dispatchEvent(
                            new ShowToastEvent({
                                title: 'Payment Cancelled',
                                message: 'Your order is still awaiting payment.',
                                variant: 'warning'
                            })
                        );
                    }
                }
            };

            // 7. Open Razorpay popup
            const razorpay = new window.Razorpay(options);

            razorpay.on('payment.failed', (response) => {

                this.isPlacingOrder = false;

                this.errorMessage =
                    response.error?.description ||
                    'Payment failed. Please try again.';

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Payment Failed',
                        message: this.errorMessage,
                        variant: 'error'
                    })
                );
            });

            razorpay.open();

        } catch (error) {

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
}
