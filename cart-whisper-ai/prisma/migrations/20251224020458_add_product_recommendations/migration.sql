-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "sourceProductTitle" TEXT NOT NULL,
    "sourceProductPrice" REAL NOT NULL,
    "sourceProductCategory" TEXT,
    "sourceProductImage" TEXT,
    "recommendedProductId" TEXT NOT NULL,
    "recommendedProductTitle" TEXT NOT NULL,
    "recommendedProductPrice" REAL NOT NULL,
    "recommendedProductCategory" TEXT,
    "recommendedProductVendor" TEXT,
    "recommendedProductImage" TEXT,
    "similarity" REAL NOT NULL,
    "reasoning" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ProductRecommendation_shop_sourceProductId_idx" ON "ProductRecommendation"("shop", "sourceProductId");

-- CreateIndex
CREATE INDEX "ProductRecommendation_shop_isActive_idx" ON "ProductRecommendation"("shop", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecommendation_shop_sourceProductId_recommendedProductId_key" ON "ProductRecommendation"("shop", "sourceProductId", "recommendedProductId");
