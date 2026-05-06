export default function proxyEvents(from, to, events) {
    const eventFunctions = new Map();
    for (const event of events) {
        const eventFunction = (...arguments_) => {
            to.emit(event, ...arguments_);
        };
        eventFunctions.set(event, eventFunction);
        from.on(event, eventFunction);
    }
    return () => {
        for (const [event, eventFunction] of eventFunctions) {
            from.off(event, eventFunction);
        }
    };
}
