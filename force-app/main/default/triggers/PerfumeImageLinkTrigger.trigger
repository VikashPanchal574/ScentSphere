trigger PerfumeImageLinkTrigger on ContentDocumentLink (after insert) {
    PerfumeImageService.handleNewLinks(Trigger.new);
}
