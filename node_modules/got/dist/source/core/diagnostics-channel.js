import { randomUUID } from 'node:crypto';
import diagnosticsChannel from 'node:diagnostics_channel';
const channels = {
    requestCreate: diagnosticsChannel.channel('got:request:create'),
    requestStart: diagnosticsChannel.channel('got:request:start'),
    responseStart: diagnosticsChannel.channel('got:response:start'),
    responseEnd: diagnosticsChannel.channel('got:response:end'),
    retry: diagnosticsChannel.channel('got:request:retry'),
    error: diagnosticsChannel.channel('got:request:error'),
    redirect: diagnosticsChannel.channel('got:response:redirect'),
};
export function generateRequestId() {
    return randomUUID();
}
const publishToChannel = (channel, message) => {
    if (channel.hasSubscribers) {
        channel.publish(message);
    }
};
export function publishRequestCreate(message) {
    publishToChannel(channels.requestCreate, message);
}
export function publishRequestStart(message) {
    publishToChannel(channels.requestStart, message);
}
export function publishResponseStart(message) {
    publishToChannel(channels.responseStart, message);
}
export function publishResponseEnd(message) {
    publishToChannel(channels.responseEnd, message);
}
export function publishRetry(message) {
    publishToChannel(channels.retry, message);
}
export function publishError(message) {
    publishToChannel(channels.error, message);
}
export function publishRedirect(message) {
    publishToChannel(channels.redirect, message);
}
