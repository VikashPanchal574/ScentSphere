import { LightningElement, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';

import verifyRazorpayPaymentLink
    from '@salesforce/apex/RazorpayPaymentController.verifyRazorpayPaymentLink';
import checkPaymentLinkStatus
    from '@salesforce/apex/RazorpayPaymentController.checkPaymentLinkStatus';
import getOrderIdForPaidLink
    from '@salesforce/apex/PaymentReturnController.getOrderIdForPaidLink';
import getOrderDetails
    from '@salesforce/apex/OrderConfirmationController.getOrderDetails';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;


export default class PaymentReturn extends NavigationMixin(LightningElement) {

    razorpayPaymentId;
    razorpayPaymentLinkId;

    isVerifying = true;
    isWaiting = false;
    isTimedOut = false;
    isSuccess = false;
    errorMessage;

    isLoadingOrder = false;
    orderErrorMessage;
    order;
    orderItems = [];

    verificationStarted = false;

    pollTimer;
    pollStartedAt;
    pollErrors = 0;
    stopped = false;

    disconnectedCallback() {
        this.stopped = true;
        clearTimeout(this.pollTimer);
    }

    @wire(CurrentPageReference)
    getPageReference(pageRef) {

        if (!pageRef || this.verificationStarted) {
            return;
        }

        const params = pageRef.state || {};

        this.razorpayPaymentId = params.razorpay_payment_id;
        this.razorpayPaymentLinkId = params.razorpay_payment_link_id;

        if (!this.razorpayPaymentLinkId) {
            this.isVerifying = false;
            this.errorMessage =
                'Required payment details are missing. Please contact support.';
            return;
        }

        this.verificationStarted = true;

        if (!this.razorpayPaymentId) {
            // Customer is paying in the Razorpay tab. This tab waits and
            // confirms the payment itself, without the browser redirect.
            this.startWaiting();
            return;
        }

        this.verifyPayment();
    }

    // ---------- Redirect path (unchanged behaviour) ----------

    async verifyPayment() {

        let verified = false;

        try {
            const result = await verifyRazorpayPaymentLink({
                paymentLinkId: this.razorpayPaymentLinkId,
                razorpayPaymentId: this.razorpayPaymentId
            });

            if (result !== true) {
                throw new Error('Payment verification could not be confirmed.');
            }

            verified = true;
            this.isSuccess = true;

        } catch (error) {
            this.errorMessage =
                error?.body?.message ||
                error?.message ||
                'Unable to verify payment. Please contact support.';
            console.error('Payment verification error:', error);

        } finally {
            this.isVerifying = false;
        }

        if (verified) {
            await this.loadOrder();
        }
    }

    // ---------- Waiting / polling path ----------

    startWaiting() {
        this.isVerifying = false;
        this.isWaiting = true;
        this.pollStartedAt = Date.now();
        this.pollPayment();
    }

    async pollPayment() {

        if (this.stopped || !this.isWaiting) {
            return;
        }

        try {
            const result = await checkPaymentLinkStatus({
                paymentLinkId: this.razorpayPaymentLinkId
            });

            if (this.stopped) {
                return;
            }

            this.pollErrors = 0;

            if (result && result.status === 'PAID') {
                this.isWaiting = false;
                this.isSuccess = true;
                this.razorpayPaymentId = result.razorpayPaymentId;
                this.markOrderConfirmedInTitle();
                await this.loadOrder();
                return;
            }

        } catch (error) {
            if (this.stopped) {
                return;
            }

            this.pollErrors += 1;
            console.error('Payment status check error:', error);

            if (this.pollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
                this.isWaiting = false;
                this.errorMessage =
                    error?.body?.message ||
                    'Unable to verify payment. Please contact support.';
                return;
            }
        }

        if (Date.now() - this.pollStartedAt >= MAX_POLL_MS) {
            this.isWaiting = false;
            this.isTimedOut = true;
            return;
        }

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.pollTimer = setTimeout(() => this.pollPayment(), POLL_INTERVAL_MS);
    }

    // The customer is usually looking at the Razorpay tab. A page cannot pull
    // its own tab to the front, so the tab title is the visible hint that the
    // order is confirmed. Best effort only.
    markOrderConfirmedInTitle() {
        try {
            document.title = '\u2714 Order confirmed - ScentSphere';
        } catch (e) {
            // Title is only a visual hint.
        }
    }

    // ---------- Order details ----------

    // Payment is already verified at this point. A failure here must never
    // turn the page into "Payment Verification Failed".
    async loadOrder() {

        this.isLoadingOrder = true;
        this.orderErrorMessage = undefined;

        try {
            const orderId = await getOrderIdForPaidLink({
                paymentLinkId: this.razorpayPaymentLinkId
            });

            const data = await getOrderDetails({ orderId });

            this.order = {
                ...data.orderRecord,
                formattedDate: this.formatDate(data.orderRecord.Order_Date__c),
                formattedTotal: this.formatCurrency(
                    data.orderRecord.Total_Amount__c
                ),
                razorpayPaymentId: this.razorpayPaymentId
            };

            this.orderItems = (data.orderItems || []).map(item => ({
                ...item,
                productName: item.Perfume__r?.Product_Name__c,
                imageUrl: item.Perfume__r?.Product_Image_URL__c || '',
                formattedPrice: this.formatCurrency(item.Unit_Price__c),
                formattedSubtotal: this.formatCurrency(item.Subtotal__c)
            }));

        } catch (error) {
            this.orderErrorMessage =
                'Your payment was successful, but we could not load the order details right now.';
            console.error('Order details error:', error);

        } finally {
            this.isLoadingOrder = false;
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    formatDate(value) {
        if (!value) {
            return '';
        }
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
            return value;
        }
        return parsed.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    handleContinueShopping() {
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: 'Shop__c'
            }
        });
    }

    get statusMessage() {
        if (this.isVerifying) {
            return 'Please wait while we confirm your payment with Razorpay.';
        }

        if (this.isSuccess) {
            return 'Your payment was confirmed and your order is being processed.';
        }

        return '';
    }
}