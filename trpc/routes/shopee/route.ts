import { z } from "zod";
import { publicProcedure } from "../../create-context";
import * as crypto from "crypto";

// Shopee Affiliate API credentials (Brasil)
const SHOPEE_APP_ID = "18389700365";
const SHOPEE_API_SECRET = "P2F6AWJNJM7ZUEP4DF45KBWTTZIV4IXG";
const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

interface ShopeeProduct {
    itemId: number;
    productName: string;
    commissionRate: string;
    commission: string;
    sales: number;
    offerLink: string;
    imageUrl: string;
}

interface ShopeeResponse {
    data?: {
        productOfferV2?: {
            nodes?: ShopeeProduct[];
            pageInfo?: {
                hasNextPage: boolean;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

/**
 * Generate SHA256 signature for Shopee API authentication
 */
function generateSignature(appId: string, timestamp: string, payload: string, secret: string): string {
    const factor = appId + timestamp + payload + secret;
    return crypto.createHash("sha256").update(factor).digest("hex");
}

/**
 * Search products on Shopee Affiliate API
 */
export const searchProductsProcedure = publicProcedure
    .input(
        z.object({
            keyword: z.string().min(1).max(200),
            limit: z.number().min(1).max(50).optional().default(20),
            page: z.number().min(1).optional().default(1),
        })
    )
    .query(async ({ input }) => {
        const { keyword, limit, page } = input;
        const timestamp = Math.floor(Date.now() / 1000).toString();

        // GraphQL query - sortType 5 = by commission rate (highest first)
        // Using imageUrl field for product images
        const graphqlQuery = `query{productOfferV2(keyword:"${keyword.replace(/"/g, '\\"')}",page:${page},limit:${limit},sortType:5){nodes{itemId productName imageUrl commissionRate commission sales offerLink}pageInfo{hasNextPage}}}`;

        const payload = JSON.stringify({ query: graphqlQuery });

        // Generate signature
        const signature = generateSignature(SHOPEE_APP_ID, timestamp, payload, SHOPEE_API_SECRET);

        try {
            const response = await fetch(SHOPEE_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `SHA256 Credential=${SHOPEE_APP_ID},Timestamp=${timestamp},Signature=${signature}`,
                },
                body: payload,
            });

            if (!response.ok) {
                console.error("[Shopee API] HTTP error:", response.status, response.statusText);
                return {
                    products: [],
                    hasNextPage: false,
                    error: `API returned status ${response.status}`,
                };
            }

            const data: ShopeeResponse = await response.json();

            if (data.errors && data.errors.length > 0) {
                console.error("[Shopee API] GraphQL errors:", data.errors);
                return {
                    products: [],
                    hasNextPage: false,
                    error: data.errors[0].message,
                };
            }

            const nodes = data.data?.productOfferV2?.nodes || [];
            const hasNextPage = data.data?.productOfferV2?.pageInfo?.hasNextPage || false;

            const products = nodes.map((node) => ({
                itemId: node.itemId,
                productName: node.productName,
                productImage: node.imageUrl || '',
                commissionRate: node.commissionRate,
                commission: node.commission,
                sales: node.sales,
                offerLink: node.offerLink,
            }));

            console.log(`[Shopee API] Found ${products.length} products for keyword: "${keyword}"`);

            return {
                products,
                hasNextPage,
                error: null,
            };
        } catch (error) {
            console.error("[Shopee API] Fetch error:", error);
            return {
                products: [],
                hasNextPage: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
