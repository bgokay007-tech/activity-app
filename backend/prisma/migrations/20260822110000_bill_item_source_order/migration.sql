-- Adisyon kalemine, hangi siparişten geldiğini işaretlemek için sourceOrderId eklendi.
-- Aynı maça art arda gelen siparişler aynı adisyona "N. Sipariş" olarak gruplanabilsin diye.
ALTER TABLE "VenueBillItem" ADD COLUMN "sourceOrderId" TEXT;
