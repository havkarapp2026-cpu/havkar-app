/*
 * HAVKAR message receipt decisions.
 *
 * SENT is the absence of a receipt after the message row exists.
 * DELIVERED is a server receipt without read_at.
 * READ requires the open, visible, rendered conversation.
 * is_read on the message row is never a receipt.
 */
(function (root, factory) {

    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    root.HAVKAR_MESSAGE_RECEIPTS = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    function receiptStatus(receipt) {

        if (receipt && receipt.read_at) {
            return "read";
        }

        if (receipt && receipt.delivered_at) {
            return "delivered";
        }

        return "sent";
    }


    function checkmarkForStatus(status) {

        if (status === "read") {
            return {
                marks: "✓✓",
                className: "message-checks read",
                title: "Read"
            };
        }

        if (status === "delivered") {
            return {
                marks: "✓✓",
                className: "message-checks delivered",
                title: "Delivered"
            };
        }

        return {
            marks: "✓",
            className: "message-checks",
            title: "Sent"
        };
    }


    function sameId(left, right) {

        return String(left || "") === String(right || "");
    }


    function planReceiptActions(input) {

        const plan = {
            deliver: false,
            read: false
        };
        const message = input && input.message;
        const userId = input && input.userId;

        if (!message || !message.id || !userId) {
            return plan;
        }

        if (sameId(message.sender_id, userId)) {
            return plan;
        }

        const receipt = input.receipt || null;

        if (!receipt || !receipt.delivered_at) {
            plan.deliver = true;
        }

        const viewing =
            input.conversationOpen === true &&
            input.pageVisible === true &&
            input.rendered === true &&
            sameId(
                message.conversation_id,
                input.openConversationId
            );

        if (viewing && (!receipt || !receipt.read_at)) {
            plan.read = true;
        }

        return plan;
    }


    function mergeReceipt(current, incoming) {

        if (!incoming) {
            return current || null;
        }

        if (!current) {
            return incoming;
        }

        return Object.assign({}, incoming, {
            delivered_at: current.delivered_at || incoming.delivered_at || null,
            read_at: current.read_at || incoming.read_at || null
        });
    }


    function countUnread(incomingCount, readReceiptCount) {

        const incoming = Number(incomingCount) || 0;
        const read = Number(readReceiptCount) || 0;

        return Math.max(0, incoming - read);
    }


    return {
        receiptStatus: receiptStatus,
        checkmarkForStatus: checkmarkForStatus,
        planReceiptActions: planReceiptActions,
        mergeReceipt: mergeReceipt,
        countUnread: countUnread
    };

});
