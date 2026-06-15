# Attention Routing in Sparse Transformer Networks

**Authors:** A. Ramirez, J. Park, S. Okafor
**Affiliation:** Internal Research Memo, Synthetic for DocAI Golden Set, 2026

## Abstract

This memo describes a routing variant for sparse transformer attention that reduces compute by 38% on the WMT-22 EN-ES benchmark while preserving translation quality within 0.4 BLEU points. The method, called Gated Sparse Attention (GSA), introduces a learned gate at each attention head that selects a subset of key-value pairs to attend to per query. Unlike top-k attention, GSA uses a sigmoid gate trained jointly with the attention weights, which removes the need for a hard top-k operator and allows backpropagation through the routing decision. We report results on machine translation, long-context summarization, and image classification.

## 1. Introduction

Dense self-attention scales quadratically with sequence length. For sequences beyond 4,000 tokens this becomes the dominant cost in transformer inference. Prior work explored sparsity through fixed patterns (Sparse Transformer, Longformer) or content-based selection (Routing Transformer, Performer). Most content-based methods rely on a top-k operator that is not differentiable, requiring straight-through estimators or other approximations.

This memo proposes Gated Sparse Attention, where each head learns a gating function g(q, k) that produces a soft selection over keys for each query. The gate is trained end-to-end with the attention.

## 2. Method

For each attention head h, we compute:

- Standard attention scores s = softmax(q · k / sqrt(d))
- Gate values g = sigmoid(W_g · [q; k] + b_g)
- Routed attention r = (s * g) / sum(s * g)

The gating matrix W_g has shape (2d, 1), where d is the per-head dimension. This adds 2d parameters per head, a negligible overhead.

We initialize b_g to 2.0 so that g starts close to 1.0 (dense behavior) and let training shrink it.

## 3. Experiments

### 3.1 Machine translation

Training on WMT-22 EN-ES with a 6-layer encoder and 6-layer decoder, we observe:

- Baseline (dense): 34.8 BLEU, 100% FLOPs.
- GSA (ours): 34.4 BLEU, 62% FLOPs.

The drop in BLEU is within reported variance for this benchmark.

### 3.2 Long-context summarization

On the GovReport benchmark (median 9,000 tokens), GSA reduces inference latency by 41% at p95.

### 3.3 Image classification

On ImageNet-1k with ViT-Base, GSA achieves 81.2% top-1 accuracy vs. 81.4% for the dense baseline.

## 4. Limitations

GSA reduces FLOPs but not memory: the full K and V matrices must still be materialized. Memory savings require a separate technique such as paged attention or sliding-window attention; we did not combine these in this study.

The training cost is approximately 1.08× the dense baseline due to the additional gate computation in the forward pass.

## 5. Conclusion

Gated Sparse Attention offers a 38% FLOPs reduction with minimal quality cost on machine translation and similar gains on long-context tasks. The method is end-to-end differentiable and adds negligible parameters. We do not claim novelty against all related methods; the contribution is the specific gate-with-sigmoid formulation and the empirical study.

## References

1. Vaswani et al. Attention is all you need. NeurIPS 2017.
2. Child et al. Generating long sequences with sparse transformers. arXiv 2019.
3. Roy et al. Efficient content-based sparse attention with routing transformers. TACL 2021.
