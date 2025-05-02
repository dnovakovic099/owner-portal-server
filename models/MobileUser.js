// src/entity/MobileUserEntity.js
const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
    name: 'MobileUserEntity',
    tableName: 'mobileUsers',
    columns: {
        id: {
            primary: true,
            type: 'int',
            generated: true
        },
        hostawayId: {
            type: 'int',
            nullable: false
        },
        firstName: {
            type: 'varchar',
            length: 50,
            nullable: false
        },
        lastName: {
            type: 'varchar',
            length: 50,
            nullable: true
        },
        email: {
            type: 'varchar',
            length: 100,
            nullable: false
        },
        password: {
            type: 'varchar',
            length: 255,
            nullable: false
        },
        revenueSharing: {
            type: 'int',
            nullable: true
        },
        user_id: {
            type: 'varchar',
            length: 100,
            nullable: false
        },
        referralCode: {
            type: 'varchar',
            nullable: true,
            default: null
        }
    },

});
