const { AppDataSource } = require("../config/database");
const FCMToken = require("../models/FCMToken");
const { In } = require("typeorm");
const admin = require("../config/firebaseMessagingConfig");


const sendNotificationToUser = async (userIds, payload) => {

    const fcmTokenRepo = AppDataSource.getRepository(FCMToken);
    const tokens = await fcmTokenRepo.find({
        where: {
            userId: In(userIds)
        },
    });

    const tokenList = tokens.map((t) => t.token);
    if (tokenList.length === 0) {
        console.info(`[sendNotificationToUser] No FCM tokens found for user ${userIds}`);
        return;
    }

    const message = {
        notification: {
            title: payload.title,
            body: payload.body,
        },
        tokens: tokenList,
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.info(`[sendNotificationToUser] FCM sent to ${response.successCount} devices, failed: ${response.failureCount}`);

        // Clean up invalid tokens
        const failedTokens = response.responses
            .map((res, i) => (!res.success ? tokenList[i] : null))
            .filter(Boolean);

        if (failedTokens.length > 0) {
            // await fcmRepo.delete({ token: In(failedTokens) });
            console.info(`[sendNotificationToUser] Deleted ${failedTokens.length} invalid tokens`);
        }
    } catch (err) {
        console.error('[sendNotificationToUser] Error sending FCM notification:', err);
    }
};


const sendNotificationToAll = async (payload) => {
    const fcmTokenRepo = AppDataSource.getRepository(FCMToken);
    const tokens = await fcmTokenRepo.find();

    const tokenList = tokens.map((t) => t.token);
    if (tokenList.length === 0) {
        console.info(`[sendNotificationToUser] No FCM tokens found`);
        return;
    }

    const message = {
        notification: {
            title: payload.title,
            body: payload.body,
        },
        tokens: tokenList,
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.info(`[sendNotificationToUser] FCM sent to ${response.successCount} devices, failed: ${response.failureCount}`);

        // Clean up invalid tokens
        const failedTokens = response.responses
            .map((res, i) => (!res.success ? tokenList[i] : null))
            .filter(Boolean);

        if (failedTokens.length > 0) {
            // await fcmRepo.delete({ token: In(failedTokens) });
            console.info(`[sendNotificationToUser] Deleted ${failedTokens.length} invalid tokens`);
        }
    } catch (err) {
        console.error('[sendNotificationToUser] Error sending FCM notification:', err);
    }
};

module.exports = {
    sendNotificationToAll,
    sendNotificationToUser
};
