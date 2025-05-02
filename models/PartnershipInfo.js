const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
    name: 'PartnershipInfoEntity',
    tableName: 'partnership_info',
    columns: {
        id: {
            primary: true,
            type: 'int',
            generated: true
        },
        listingId: {
            type: 'int',
            nullable: false
        },
        totalEarned: {
            type: 'decimal',
            precision: 10,
            scale: 2,
            nullable: true,
            default: 0
        },
        pendingCommission: {
            type: 'decimal',
            precision: 10,
            scale: 2,
            nullable: true,
            default: 0
        },
        activeReferral: {
            type: 'int',
            nullable: true,
            default: 0
        },
        yearlyProjection: {
            type: 'decimal',
            precision: 10,
            scale: 2,
            nullable: true,
            default: 0
        },
        createdAt: {
            type: 'timestamp',
            createDate: true
        },
        updatedAt: {
            type: 'timestamp',
            updateDate: true
        },
        createdBy: {
            type: 'varchar',
            nullable: true
        },
        updatedBy: {
            type: 'varchar',
            nullable: true
        }
    }
});
