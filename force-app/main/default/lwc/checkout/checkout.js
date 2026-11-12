
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import placeOrder from '@salesforce/apex/CheckoutController.placeOrder';
import getCart from '@salesforce/apex/CartController.getCart';

import createRazorpayPaymentLink
    from '@salesforce/apex/RazorpayPaymentController.createRazorpayPaymentLink';

const PAYMENT_RETURN_PATH = '/scentsphere/payment-return';

export default class Checkout extends NavigationMixin(LightningElement) {

    // Shipping address fields
    fullName = '';
    mobileNumber = '';
    houseNumber = '';
    streetArea = '';
    landmark = '';
    city = '';
    shippingState = '';
    pinCode = '';
    country = 'India';

    isPlacingOrder = false;
    errorMessage = '';

    cart;
    cartItems = [];

    stateOptions = [
        { label: 'Andhra Pradesh', value: 'Andhra Pradesh' },
        { label: 'Arunachal Pradesh', value: 'Arunachal Pradesh' },
        { label: 'Assam', value: 'Assam' },
        { label: 'Bihar', value: 'Bihar' },
        { label: 'Chhattisgarh', value: 'Chhattisgarh' },
        { label: 'Goa', value: 'Goa' },
        { label: 'Gujarat', value: 'Gujarat' },
        { label: 'Haryana', value: 'Haryana' },
        { label: 'Himachal Pradesh', value: 'Himachal Pradesh' },
        { label: 'Jharkhand', value: 'Jharkhand' },
        { label: 'Karnataka', value: 'Karnataka' },
        { label: 'Kerala', value: 'Kerala' },
        { label: 'Madhya Pradesh', value: 'Madhya Pradesh' },
        { label: 'Maharashtra', value: 'Maharashtra' },
        { label: 'Manipur', value: 'Manipur' },
        { label: 'Meghalaya', value: 'Meghalaya' },
        { label: 'Mizoram', value: 'Mizoram' },
        { label: 'Nagaland', value: 'Nagaland' },
        { label: 'Odisha', value: 'Odisha' },
        { label: 'Punjab', value: 'Punjab' },
        { label: 'Rajasthan', value: 'Rajasthan' },
        { label: 'Sikkim', value: 'Sikkim' },
        { label: 'Tamil Nadu', value: 'Tamil Nadu' },
        { label: 'Telangana', value: 'Telangana' },
        { label: 'Tripura', value: 'Tripura' },
        { label: 'Uttar Pradesh', value: 'Uttar Pradesh' },
        { label: 'Uttarakhand', value: 'Uttarakhand' },
        { label: 'West Bengal', value: 'West Bengal' },
        { label: 'Andaman and Nicobar Islands', value: 'Andaman and Nicobar Islands' },
        { label: 'Chandigarh', value: 'Chandigarh' },
        { label: 'Dadra and Nagar Haveli and Daman and Diu', value: 'Dadra and Nagar Haveli and Daman and Diu' },
        { label: 'Delhi', value: 'Delhi' },
        { label: 'Jammu and Kashmir', value: 'Jammu and Kashmir' },
        { label: 'Ladakh', value: 'Ladakh' },
        { label: 'Lakshadweep', value: 'Lakshadweep' },
        { label: 'Puducherry', value: 'Puducherry' }
    ];

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

    // Handle all address inputs through one method
    handleInputChange(event) {
        const fieldName = event.target.dataset.field;

        if (fieldName) {
            this[fieldName] = event.target.value;
        }

        this.errorMessage = '';
    }

    // Validate all address fields
    validateShippingAddress() {

        const fields = [
            ...this.template.querySelectorAll(
                'lightning-input, lightning-combobox'
            )
        ];

        let allValid = true;

        fields.forEach(field => {
            const fieldValid = field.reportValidity();

            if (!fieldValid) {
                allValid = false;
            }
        });

        const requiredValues = [
            this.fullName,
            this.mobileNumber,
            this.houseNumber,
            this.streetArea,
            this.city,
            this.shippingState,
            this.pinCode
        ];

        if (requiredValues.some(value => !value || !value.trim())) {
            allValid = false;
        }

        return allValid;
    }

    async handlePlaceOrder() {

        if (!this.validateShippingAddress()) {
            this.errorMessage = 'Please complete all required shipping fields correctly.';
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

        // Open payment tab synchronously during the click
        let paymentWindow = null;

        try {
            paymentWindow = window.open('', '_blank');
        } catch (e) {
            paymentWindow = null;
        }

        try {

            // 1. Create Salesforce Customer Order
            const orderId = await placeOrder({
                fullName: this.fullName.trim(),
                mobileNumber: this.mobileNumber.trim(),
                houseNumber: this.houseNumber.trim(),
                streetArea: this.streetArea.trim(),
                landmark: this.landmark.trim(),
                city: this.city.trim(),
                shippingState: this.shippingState,
                pinCode: this.pinCode.trim(),
                country: this.country
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

            // 4. Redirect customer to Razorpay
            let openedInNewTab = false;

            if (paymentWindow && paymentLink.paymentLinkId) {
                try {
                    paymentWindow.location.href =
                        paymentLink.paymentLinkUrl;

                    openedInNewTab = true;

                } catch (e) {
                    openedInNewTab = false;
                    this.closeWindow(paymentWindow);
                }
            }

            if (openedInNewTab) {

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
