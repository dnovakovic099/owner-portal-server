// database.js
const { DataSource } = require("typeorm");
require("reflect-metadata");

const AppDataSource = new DataSource({
    type: "mariadb",
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    synchronize: false,
    entities: ["models/*.js"], // Adjust path if necessary
});

// Initialize connection
async function connectDatabase() {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        console.log("Database connection established.");
    }
    return AppDataSource;
}

module.exports = { connectDatabase, AppDataSource };
