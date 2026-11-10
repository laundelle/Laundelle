import { MongoClient, Db } from 'mongodb';
import dns from 'dns';
import { validateProductionEnv } from './validateEnv';

// Validate critical secrets in production environment on module load
validateProductionEnv();

// Ensure DNS uses reliable public nameservers on Node.js to prevent querySrv ETIMEOUT
try {
    dns.setDefaultResultOrder?.('ipv4first');
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
    // Non-fatal if runtime sandbox prohibits custom DNS servers
}

let clientPromise: Promise<MongoClient> | null = null;

async function connectClient(uri: string): Promise<MongoClient> {
    const clientOptions = {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        maxPoolSize: 50,
    };

    try {
        const client = new MongoClient(uri, clientOptions);
        return await client.connect();
    } catch (err: any) {
        const isSrvTimeout = err?.code === 'ETIMEOUT' || 
                             err?.syscall === 'querySrv' || 
                             String(err?.message || '').includes('querySrv');

        // Automatic fallback: if SRV DNS lookup fails on serverless environments, fail over to MONGODB_DIRECT_URI if configured
        const directUri = process.env.MONGODB_DIRECT_URI;
        if (isSrvTimeout && directUri) {
            console.warn('[MongoDB] querySrv ETIMEOUT on SRV URI. Failing over to MONGODB_DIRECT_URI...');
            const fallbackClient = new MongoClient(directUri, clientOptions);
            return await fallbackClient.connect();
        }
        throw err;
    }
}

function getClientPromise(): Promise<MongoClient> {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Please add your MONGODB_URI environment variable to your .env file.');
    }

    if (process.env.NODE_ENV === 'development') {
        const globalWithMongo = global as typeof globalThis & {
            _mongoClientPromise?: Promise<MongoClient> | null;
        };

        if (!globalWithMongo._mongoClientPromise) {
            globalWithMongo._mongoClientPromise = connectClient(uri).catch((err) => {
                // Clear cached rejected promise so subsequent requests can retry
                globalWithMongo._mongoClientPromise = null;
                clientPromise = null;
                throw err;
            });
        }
        clientPromise = globalWithMongo._mongoClientPromise;
    } else {
        if (!clientPromise) {
            clientPromise = connectClient(uri).catch((err) => {
                clientPromise = null;
                throw err;
            });
        }
    }
    return clientPromise;
}

export default {
    then(onfulfilled?: any, onrejected?: any) {
        return getClientPromise().then(onfulfilled, onrejected);
    }
} as unknown as Promise<MongoClient>;

let indexesInitPromise: Promise<void> | null = null;
let indexesSuccessfullyInitialized = false;

export async function ensureIndexesInitialized(): Promise<void> {
    if (indexesSuccessfullyInitialized) return;
    if (!indexesInitPromise) {
        indexesInitPromise = (async () => {
            try {
                const { ensureDatabaseIndexes } = await import('./dbIndexes');
                await ensureDatabaseIndexes();
                indexesSuccessfullyInitialized = true;
            } catch (err: any) {
                indexesInitPromise = null;
                console.error('[MongoDB Index Initialization Error]:', err.message);
                throw err;
            }
        })();
    }
    return indexesInitPromise;
}

export async function getDb(dbName = 'Laundry'): Promise<Db> {
    const cp = await getClientPromise();
    const db = cp.db(dbName);

    // Automatically initialize/verify database indexes on initial connection
    if (!indexesSuccessfullyInitialized && !indexesInitPromise) {
        ensureIndexesInitialized().catch((err) => {
            console.error('[MongoDB Index Background Warning]:', err.message);
        });
    }

    return db;
}

export async function getMongoClient(): Promise<MongoClient> {
    return getClientPromise();
}
