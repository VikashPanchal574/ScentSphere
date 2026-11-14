
import { LightningElement, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import isGuestUser from '@salesforce/user/isGuest';

export default class ScentsphereAboutContact extends NavigationMixin(LightningElement) {

    isSubmitting = false;
    formMessage = '';

    isGuest = isGuestUser;

    pendingSection = null;
    scrollScheduled = false;

    // Read section parameter from URL
    @wire(CurrentPageReference)
    handlePageReference(pageReference) {

        if (!pageReference) {
            return;
        }

        const section = pageReference.state?.c__section;

        if (section === 'about' || section === 'contact') {
            this.pendingSection = section;
            this.scheduleSectionScroll();
        }
    }

    // Retry scrolling after component rendering
    renderedCallback() {
        this.scheduleSectionScroll();
    }

    // Wait for the rendered section before scrolling
    scheduleSectionScroll() {

        if (!this.pendingSection || this.scrollScheduled) {
            return;
        }

        this.scrollScheduled = true;

        window.requestAnimationFrame(() => {

            this.scrollScheduled = false;

            this.scrollToPendingSection();
        });
    }

    // Common navigation scrolling
    scrollToPendingSection() {

        if (!this.pendingSection) {
            return;
        }

        const selector = this.pendingSection === 'about'
            ? '[data-target="about-top"]'
            : '[data-target="contact-section"]';

        const target = this.template.querySelector(selector);

        if (target) {

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            this.pendingSection = null;
        }
    }

    // Discover Our Story button
    handleAboutClick() {

        const aboutSection = this.template.querySelector(
            '[data-target="about-section"]'
        );

        if (aboutSection) {

            aboutSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Get in Touch button
    handleContactClick() {

        const contactSection = this.template.querySelector(
            '[data-target="contact-section"]'
        );

        if (contactSection) {

            contactSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Navigate guest user to Salesforce Login
    handleLogin() {

        this[NavigationMixin.Navigate]({

            type: 'comm__loginPage',

            attributes: {
                actionName: 'login'
            }
        });
    }

    // Submit Contact Form
    handleSubmit(event) {

        event.preventDefault();

        if (this.isGuest || this.isSubmitting) {
            return;
        }

        this.isSubmitting = true;
        this.formMessage = '';

        const fields = event.detail.fields;

        fields.Status = 'New';
        fields.Origin = 'Web';

        const form = this.template.querySelector(
            'lightning-record-edit-form'
        );

        if (form) {
            form.submit(fields);
        } else {
            this.isSubmitting = false;
        }
    }

    // Successful Case Creation
    handleSuccess() {

        this.isSubmitting = false;

        this.formMessage =
            'Thank you for contacting ScentSphere! Your message has been submitted successfully.';

        this.template
            .querySelectorAll('lightning-input-field')
            .forEach(field => field.reset());
    }

    // Form Submission Error
    handleError(event) {

        this.isSubmitting = false;

        this.formMessage =
            event.detail?.detail ||
            'Unable to submit your message. Please try again.';

        console.error(
            'Contact Form Error:',
            event.detail
        );
    }
}
