const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
    name: 'FCMToken',
    tableName: 'fcm_token',
    columns: {
        id: {
            primary: true,
            type: 'int',
            generated: true
        },
        token: {
            type: 'varchar'
        },
        userId: {
            type: 'int'
        },
        createdAt: {
            type: 'timestamp',
            createDate: true
        }
    }
});
