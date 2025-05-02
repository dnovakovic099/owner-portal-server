const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
    name: 'HostawayUser',
    tableName: 'hostaway_user',
    columns: {
        id: {
            primary: true,
            type: 'int',
            generated: true
        },
        ha_userId: {
            type: 'int',
            nullable: false
        },
        listingId: {
            type: 'int',
            nullable: false
        },
        createdAt: {
            type: 'timestamp',
            createDate: true
        },
        updatedAt: {
            type: 'timestamp',
            updateDate: true
        }
    }
});
