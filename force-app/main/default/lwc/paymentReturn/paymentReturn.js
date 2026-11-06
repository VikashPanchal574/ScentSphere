import { LightningElement, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';

export default class PaymentReturn extends LightningElement {

    razorpayPaymentId;
    razorpayPaymentLinkId;
    paymentLinkStatus;
    paymentLinkReferenceId;
    razorpaySignature;

    @wire(CurrentPageReference)
    getPageReference(pageRef) {

        if (pageRef) {
            const params = pageRef.state;

            this.razorpayPaymentId =
                params.razorpay_payment_id;

            this.razorpayPaymentLinkId =
                params.razorpay_payment_link_id;

            this.paymentLinkStatus =
                params.razorpay_payment_link_status;

            this.paymentLinkReferenceId =
                params.razorpay_payment_link_reference_id;

            this.razorpaySignature =
                params.razorpay_signature;

            console.log('Payment ID:', this.razorpayPaymentId);
            console.log('Payment Link ID:', this.razorpayPaymentLinkId);
            console.log('Payment Status:', this.paymentLinkStatus);
        }
    }
}