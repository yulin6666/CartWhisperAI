-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "sourceProductTitle" TEXT NOT NULL,
    "sourceProductPrice" DOUBLE PRECISION NOT NULL,
    "sourceProductCategory" TEXT,
    "sourceProductImage" TEXT,
    "recommendedProductId" TEXT NOT NULL,
    "recommendedProductHandle" TEXT,
    "recommendedProductTitle" TEXT NOT NULL,
    "recommendedProductPrice" DOUBLE PRECISION NOT NULL,
    "recommendedProductCategory" TEXT,
    "recommendedProductVendor" TEXT,
    "recommendedProductImage" TEXT,
    "similarity" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductRecommendation_shop_sourceProductId_idx" ON "ProductRecommendation"("shop", "sourceProductId");

-- CreateIndex
CREATE INDEX "ProductRecommendation_shop_isActive_idx" ON "ProductRecommendation"("shop", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecommendation_shop_sourceProductId_recommendedProdu_key" ON "ProductRecommendation"("shop", "sourceProductId", "recommendedProductId");
