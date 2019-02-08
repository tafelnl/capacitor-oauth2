import {WebPlugin} from '@capacitor/core';
import {OAuth2AuthenticateOptions, OAuth2ClientPlugin} from "./definitions";
import {WebOptions, WebUtils} from "./web-utils";

export class OAuth2ClientPluginWeb extends WebPlugin implements OAuth2ClientPlugin {

    private webOptions: WebOptions;
    private windowHandle: Window = null;
    private intervalId: number = null;
    private loopCount = 2000;
    private intervalLength = 100;

    constructor() {
        super({
            name: 'OAuth2Client',
            platforms: ['web']
        });
    }

    async authenticate(options: OAuth2AuthenticateOptions): Promise<any> {
        this.webOptions = WebUtils.buildWebOptions(options);
        return new Promise<any>((resolve, reject) => {
            // validate
            if (!this.webOptions.appId) {
                reject(new Error("ERR_PARAM_APP_ID_REQUIRED"));
            } else if (!this.webOptions.authorizationBaseUrl) {
                reject(new Error("ERR_PARAM_AUTHORIZATION_BASE_URL_REQUIREDR"));
            } else if (!this.webOptions.redirectUrl) {
                reject(new Error("ERR_PARAM_REDIRECT_URL_REQUIRED"));
            } else {
                let loopCount = this.loopCount;
                // open window
                this.windowHandle = window.open(
                    WebUtils.getAuthorizationUrl(this.webOptions),
                    this.webOptions.windowTarget,
                    this.webOptions.windowOptions,
                    true);
                // wait for redirect and resolve the
                this.intervalId = setInterval(() => {
                    if (loopCount-- < 0) {
                        clearInterval(this.intervalId);
                        this.windowHandle.close();
                    } else {
                        let href: string;
                        try {
                            href = this.windowHandle.location.href;
                        } catch (ignore) {
                            // ignore DOMException: Blocked a frame with origin "http://localhost:4200" from accessing a cross-origin frame.
                        }

                        if (href != null) {
                            let urlParamObj = WebUtils.getUrlParams(href);
                            if (urlParamObj) {
                                clearInterval(this.intervalId);
                                // check state
                                if (urlParamObj.state === this.webOptions.state) {
                                    if (this.webOptions.responseType === "token") {
                                        // implicit flow
                                        let accessToken = urlParamObj.access_token;
                                        if (accessToken) {
                                            let tokenObj = { access_token: accessToken };
                                            this.requestResource(tokenObj, resolve, reject);
                                        } else {
                                            reject(new Error("ERR_NO_ACCESS_TOKEN"));
                                            this.closeWindow();
                                        }
                                    } else if (this.webOptions.responseType === "code") {
                                        // code flow
                                        const self = this;
                                        let authorizationCode = urlParamObj.code;
                                        if (authorizationCode) {
                                            if (!this.webOptions.accessTokenEndpoint) {
                                                reject(new Error("ERR_PARAM_ACCESS_TOKEN_ENDPOINT_REQUIRED"));
                                            } else {
                                                const tokenRequest = new XMLHttpRequest();
                                                tokenRequest.onload = function () {
                                                    if (this.status === 200) {
                                                        let accessTokenResponse = JSON.parse(this.response);
                                                        self.requestResource(accessTokenResponse, resolve, reject);
                                                    }
                                                };
                                                tokenRequest.onerror = function () {
                                                    console.log("ERR_TOKEN_ENDPOINT_REQUEST: See client logs. It might be CORS. Status text: " + this.statusText);
                                                    reject(new Error("ERR_TOKEN_ENDPOINT_REQUEST"));
                                                };
                                                tokenRequest.open("POST", this.webOptions.accessTokenEndpoint, true);
                                                tokenRequest.setRequestHeader('accept', 'application/json');
                                                tokenRequest.setRequestHeader('cache-control', 'no-cache');
                                                tokenRequest.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
                                                tokenRequest.send(WebUtils.getTokenEndpointData(this.webOptions, authorizationCode));
                                            }

                                        } else {
                                            reject(new Error("ERR_NO_AUTHORIZATION_CODE"));
                                        }
                                        this.closeWindow();
                                    } else {
                                        reject(new Error("ERR_INVALID_RESPONSE_TYPE"));
                                        this.closeWindow();
                                    }
                                } else {
                                    reject(new Error("ERR_STATES_NOT_MATCH"));
                                    this.closeWindow();
                                }
                            }
                        }
                    }
                }, this.intervalLength);
            }
        });
    }

    private requestResource(tokenObj: any, resolve: any, reject: (reason?: any) => void) {
        if (this.webOptions.resourceUrl) {
            const self = this;
            const request = new XMLHttpRequest();
            request.onload = function () {
                if (this.status === 200) {
                    let resp = JSON.parse(this.response);
                    if (resp) {
                        resp["access_token"] = tokenObj.access_token;
                    }
                    resolve(resp);
                } else {
                    reject(new Error(this.statusText));
                }
                self.closeWindow();
            };
            request.onerror = function () {
                reject(new Error(this.statusText));
                self.closeWindow();
            };
            request.open("GET", this.webOptions.resourceUrl, true);
            request.setRequestHeader('Authorization', `Bearer ${tokenObj.access_token}`);
            request.send();
        } else {
            resolve(tokenObj);
            this.closeWindow();
        }
    }

    async logout(options: OAuth2AuthenticateOptions): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            localStorage.removeItem(WebUtils.getAppId(options));
            resolve();
        });
    }

    private closeWindow() {
        clearInterval(this.intervalId);
        this.windowHandle.close();
    }
}

const OAuth2Client = new OAuth2ClientPluginWeb();

export { OAuth2Client };
