"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminClient = exports.getAuthClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // We need this! I will tell the user to add it.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
/**
 * Creates a Supabase client that acts on behalf of the user using their Clerk JWT.
 * This preserves Row-Level Security (RLS) in the database.
 */
const getAuthClient = (clerkToken) => {
    if (!clerkToken) {
        return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${clerkToken}`,
            },
        },
    });
};
exports.getAuthClient = getAuthClient;
/**
 * Creates a Supabase Admin client that bypasses RLS.
 * Use with extreme caution!
 */
const getAdminClient = () => {
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
};
exports.getAdminClient = getAdminClient;
//# sourceMappingURL=supabase.js.map