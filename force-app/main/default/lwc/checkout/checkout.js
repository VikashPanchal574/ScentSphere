
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import placeOrder
    from '@salesforce/apex/CheckoutController.placeOrder';

import getLastShippingAddress
    from '@salesforce/apex/CheckoutController.getLastShippingAddress';


import getCart
    from '@salesforce/apex/CartController.getCart';

import createRazorpayPaymentLink
    from '@salesforce/apex/RazorpayPaymentController.createRazorpayPaymentLink';

import checkPaymentLinkStatus
    from '@salesforce/apex/RazorpayPaymentController.checkPaymentLinkStatus';

const PAYMENT_RETURN_PATH = '/scentsphere/payment-return';

const PAYMENT_WINDOW_NAME = 'scentsphere_razorpay_payment';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

export default class Checkout extends NavigationMixin(LightningElement) {

    savedAddress = null;
    hasSavedAddress = false;
    addressTouched = false;


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

    // Payment tab and polling state
    paymentWindow = null;
    razorpayPaymentLinkId = null;

    isWaitingForPayment = false;
    isCheckingPayment = false;
    isRedirectingToConfirmation = false;

    paymentWaitMessage = '';

    pollTimer = null;
    pollStartedAt = 0;
    pollErrors = 0;
    componentDisconnected = false;

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

    // =====================================
    // COMPONENT LIFECYCLE
    // =====================================


    
connectedCallback() {
    this.componentDisconnected = false;

    console.info('SCENTSPHERE_CHECKOUT_AUTO_CLOSE_V2');

    this.loadLastShippingAddress();
}


    disconnectedCallback() {
        this.componentDisconnected = true;
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
    }

    // auto fill address if the user has previously entered one

async loadLastShippingAddress() {

    try {
        const addressText = await getLastShippingAddress();

        if (this.componentDisconnected || !addressText) {
            return;
        }

        const parsedAddress =
            this.parseLastShippingAddress(addressText);

        if (!parsedAddress) {
            return;
        }

        this.savedAddress = parsedAddress;
        this.hasSavedAddress = true;

        // Autofill only if user has not started typing.

        if (!this.addressTouched && !this.isPlacingOrder) {
            this.applySavedAddress();
        }

    } catch (error) {
        console.warn(
            'Could not load previous shipping address:',
            error
        );
    }
}

parseLastShippingAddress(addressText) {

    const fieldMap = {
        'Name': 'fullName',
        'Mobile': 'mobileNumber',
        'House/Flat': 'houseNumber',
        'Street/Area': 'streetArea',
        'Landmark': 'landmark',
        'City': 'city',
        'State': 'shippingState',
        'PIN Code': 'pinCode',
        'Country': 'country'
    };

    const address = {
        fullName: '',
        mobileNumber: '',
        houseNumber: '',
        streetArea: '',
        landmark: '',
        city: '',
        shippingState: '',
        pinCode: '',
        country: 'India'
    };

    addressText.split(/\r?\n/).forEach(line => {

        const colonIndex = line.indexOf(':');

        if (colonIndex < 0) {
            return;
        }

        const label = line.substring(
            0,
            colonIndex
        ).trim();

        const value = line.substring(
            colonIndex + 1
        ).trim();

        const fieldName = fieldMap[label];

        if (fieldName) {
            address[fieldName] = value;
        }
    });

    // Only reuse complete, valid addresses.
    const requiredFields = [
        'fullName',
        'mobileNumber',
        'houseNumber',
        'streetArea',
        'city',
        'shippingState',
        'pinCode'
    ];

    if (
        !requiredFields.every(field => address[field]) ||
        !/^[6-9][0-9]{9}$/.test(address.mobileNumber) ||
        !/^[1-9][0-9]{5}$/.test(address.pinCode) ||
        address.country !== 'India'
    ) {
        return null;
    }

    return address;
}

applySavedAddress() {

    if (!this.savedAddress) {
        return;
    }

    this.fullName = this.savedAddress.fullName;
    this.mobileNumber = this.savedAddress.mobileNumber;
    this.houseNumber = this.savedAddress.houseNumber;
    this.streetArea = this.savedAddress.streetArea;
    this.landmark = this.savedAddress.landmark;
    this.city = this.savedAddress.city;
    this.shippingState = this.savedAddress.shippingState;
    this.pinCode = this.savedAddress.pinCode;
    this.country = 'India';

    this.errorMessage = '';
}

handleUseSavedAddress() {
    this.applySavedAddress();
}

handleEnterNewAddress() {

    this.fullName = '';
    this.mobileNumber = '';
    this.houseNumber = '';
    this.streetArea = '';
    this.landmark = '';
    this.city = '';
    this.shippingState = '';
    this.pinCode = '';
    this.country = 'India';

    this.addressTouched = true;
    this.errorMessage = '';
}



    // =====================================
    // EXISTING CART FUNCTIONALITY
    // =====================================

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
                error.body?.message ||
                'Unable to load your cart.';
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

    get canRetryPaymentCheck() {
        return (
            this.isWaitingForPayment &&
            !this.isCheckingPayment &&
            !this.isRedirectingToConfirmation
        );
    }

    // =====================================
    // EXISTING SHIPPING INPUTS
    // =====================================

    handleInputChange(event) {

        const fieldName = event.target.dataset.field;

        if (fieldName) {
            this[fieldName] = event.target.value;
        }
         // Prevent delayed autofill from overwriting typed data.
        this.addressTouched = true;

        this.errorMessage = '';
    }

    // =====================================
    // EXISTING ADDRESS VALIDATION
    // =====================================

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

        if (
            requiredValues.some(
                value => !value || !value.trim()
            )
        ) {
            allValid = false;
        }

        return allValid;
    }

    // =====================================
    // PLACE ORDER
    // =====================================

    async handlePlaceOrder() {

        if (!this.validateShippingAddress()) {

            this.errorMessage =
                'Please complete all required shipping fields correctly.';

            return;
        }

        if (!this.cartItems.length) {

            this.errorMessage =
                'Your shopping cart is empty.';

            return;
        }

        if (this.isPlacingOrder) {
            return;
        }

        this.isPlacingOrder = true;
        this.errorMessage = '';

        // Open tab directly from the customer's click.
        let paymentWindow = null;

        try {
            paymentWindow = window.open(
                '',
                PAYMENT_WINDOW_NAME
            );
        } catch (e) {
            paymentWindow = null;
        }

        // NEW: Preserve reference while Checkout is alive.
        this.paymentWindow = paymentWindow;

        try {

            // 1. Create Salesforce Pending Order
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
            const paymentLink =
                await createRazorpayPaymentLink({
                    customerOrderId: orderId
                });

            if (
                !paymentLink ||
                !paymentLink.paymentLinkUrl ||
                !paymentLink.paymentLinkUrl.startsWith(
                    'https://rzp.io/'
                )
            ) {
                throw new Error(
                    'Invalid Razorpay payment link received.'
                );
            }

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Order Created',
                    message:
                        'Redirecting to secure Razorpay payment...',
                    variant: 'success'
                })
            );

            // 3. Open existing new tab with Razorpay link.
            let openedInNewTab = false;

            if (
                paymentWindow &&
                paymentLink.paymentLinkId
            ) {

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

                // IMPORTANT:
                // Do not navigate away from Checkout yet.
                // Keep popup reference available until PAID.

                this.razorpayPaymentLinkId =
                    paymentLink.paymentLinkId;

                this.isWaitingForPayment = true;

                this.paymentWaitMessage =
                    'Complete payment in the Razorpay tab. ' +
                    'We will check automatically.';

                this.startPaymentMonitoring();

            } else {

                // Preserve existing popup-blocked fallback.
                this.closeWindow(paymentWindow);

                window.location.assign(
                    paymentLink.paymentLinkUrl
                );
            }

        } catch (error) {

            this.closeWindow(paymentWindow);

            this.errorMessage =
                error?.body?.message ||
                error?.message ||
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

    // =====================================
    // NEW: MONITOR EXISTING PAYMENT LINK
    // =====================================

    startPaymentMonitoring() {

        if (!this.razorpayPaymentLinkId) {
            return;
        }

        clearTimeout(this.pollTimer);

        this.pollStartedAt = Date.now();
        this.pollErrors = 0;
        this.isCheckingPayment = true;

        this.pollPaymentStatus();
    }

    async pollPaymentStatus() {

        if (
            this.componentDisconnected ||
            !this.isWaitingForPayment ||
            !this.isCheckingPayment
        ) {
            return;
        }

        try {

            // Reuse the SAME existing Apex method.
            const result = await checkPaymentLinkStatus({
                paymentLinkId: this.razorpayPaymentLinkId
            });

            if (
                this.componentDisconnected ||
                !this.isCheckingPayment
            ) {
                return;
            }

            this.pollErrors = 0;

            // Payment verification comes from Apex,
            // not from a browser URL parameter.
            if (result && result.status === 'PAID') {

                this.handleVerifiedPayment();

                return;
            }

        } catch (error) {

            if (
                this.componentDisconnected ||
                !this.isCheckingPayment
            ) {
                return;
            }

            this.pollErrors += 1;

            console.error(
                'Checkout Payment Status Error:',
                error
            );

            if (
                this.pollErrors >=
                MAX_CONSECUTIVE_POLL_ERRORS
            ) {

                this.isCheckingPayment = false;

                this.paymentWaitMessage =
                    'We could not check payment status ' +
                    'right now. You can retry using the ' +
                    'same payment link.';

                return;
            }
        }

        // Stop automatic polling after 10 minutes.
        if (
            Date.now() - this.pollStartedAt >=
            MAX_POLL_MS
        ) {

            this.isCheckingPayment = false;

            this.paymentWaitMessage =
                'Payment is still awaiting confirmation. ' +
                'If you have paid, check the same payment ' +
                'again. Do not place another order.';

            return;
        }

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.pollTimer = setTimeout(
            () => this.pollPaymentStatus(),
            POLL_INTERVAL_MS
        );
    }

    // =====================================
    // NEW: PAYMENT VERIFIED
    // =====================================

    handleVerifiedPayment() {

        if (this.isRedirectingToConfirmation) {
            return;
        }

        this.isRedirectingToConfirmation = true;
        this.isCheckingPayment = false;

        clearTimeout(this.pollTimer);
        this.pollTimer = null;

        this.paymentWaitMessage =
            'Payment verified! Opening your order confirmation.';

        // Attempt closing ONLY after backend says PAID.
        this.closePaymentWindowAfterPaid();

        // Continue to existing PaymentReturn component.
        this.redirectToOrderConfirmation();
    }

    // =====================================
    // NEW: BEST-EFFORT POPUP CLOSE
    // =====================================

    closePaymentWindowAfterPaid() {

        try {

            if (
                this.paymentWindow &&
                !this.paymentWindow.closed
            ) {

                this.paymentWindow.close();
            }

        } catch (error) {

            console.warn(
                'Razorpay tab could not be closed:',
                error
            );
        }

        // Browser may reject foreground focus.
        try {
            window.focus();
        } catch (e) {
            // Best effort only.
        }
    }

    // =====================================
    // EXISTING PAYMENT RETURN DESTINATION
    // =====================================

    redirectToOrderConfirmation() {

        if (!this.razorpayPaymentLinkId) {
            return;
        }

        const returnUrl =
            PAYMENT_RETURN_PATH +
            '?razorpay_payment_link_id=' +
            encodeURIComponent(
                this.razorpayPaymentLinkId
            ) +
            '&ss_newtab=1';

        // Existing PaymentReturn.js verifies status again
        // before displaying the confirmation.
        window.location.assign(returnUrl);
    }

    // =====================================
    // RETRY SAME PAYMENT STATUS CHECK
    // =====================================

    handleRetryPaymentCheck() {

        if (
            !this.razorpayPaymentLinkId ||
            this.isCheckingPayment ||
            this.isRedirectingToConfirmation
        ) {
            return;
        }

        this.paymentWaitMessage =
            'Checking your existing Razorpay payment again...';

        // No placeOrder call.
        // No createRazorpayPaymentLink call.
        this.startPaymentMonitoring();
    }

    // =====================================
    // RETURN FOCUS TO EXISTING RAZORPAY TAB
    // =====================================

    handleFocusPaymentTab() {

        try {

            if (
                this.paymentWindow &&
                !this.paymentWindow.closed
            ) {

                this.paymentWindow.focus();

            } else {

                this.paymentWaitMessage =
                    'The Razorpay tab is no longer available. ' +
                    'You can still check your payment status here.';
            }

        } catch (error) {

            console.warn(
                'Could not focus Razorpay tab:',
                error
            );
        }
    }

    // =====================================
    // EXISTING WINDOW CLOSE HELPER
    // =====================================

    closeWindow(win) {

        try {

            if (win) {
                win.close();
            }

        } catch (e) {
            // Nothing to do if window cannot be closed.
        }
    }
}
