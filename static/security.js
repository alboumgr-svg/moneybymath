let escapeHTMLPolicy;
let scriptURLPolicy;

if (window.trustedTypes && trustedTypes.createPolicy) {
    // Keep your existing HTML policy
    escapeHTMLPolicy = trustedTypes.createPolicy('default', {
        createHTML: (string) => DOMPurify.sanitize(string, { RETURN_TRUSTED_TYPE: true })
    });

    // ADD THIS: Policy to allow the specific Disqus URL
    scriptURLPolicy = trustedTypes.createPolicy('scriptPolicy', {
        createScriptURL: (url) => {
            // Only allow the trusted Disqus domain
            if (url === 'https://MoneyByMath.disqus.com/embed.js') {
                return url;
            }
            throw new Error('Untrusted script URL: ' + url);
        }
    });
}