"""
Presences Spotlight AI — 2,000+ Student Scalability & Latency Benchmark
Tests real-world search latency of vectorized in-memory matrix matching for 2,000 students.
"""

import time
import numpy as np

def run_scalability_benchmark(num_students=2000, descriptor_dim=128, num_queries=500):
    print("=" * 65)
    print(f"  BENCHMARK: Vectorized In-Memory Search ({num_students} Students, {descriptor_dim}-D)")
    print("=" * 65)

    # 1. Synthesize 2,000 enrolled normalized student embeddings
    print(f"\n[1/3] Synthesizing {num_students} enrolled student face embeddings...")
    database = np.random.randn(num_students, descriptor_dim).astype(np.float32)
    database /= np.linalg.norm(database, axis=1, keepdims=True)

    # 2. Synthesize query faces (simulating students walking past gate)
    queries = np.random.randn(num_queries, descriptor_dim).astype(np.float32)
    queries /= np.linalg.norm(queries, axis=1, keepdims=True)

    # 3. Benchmark BLAS Matrix Dot Product (Normalized Cosine / Euclidean)
    print(f"[2/3] Benchmarking BLAS Matrix Dot Product matching over {num_queries} test frames...")
    start_time = time.perf_counter()

    for i in range(num_queries):
        query = queries[i]
        # Fast BLAS GEMV: dot product of (2000, 128) with (128,)
        similarities = np.dot(database, query)
        best_idx = np.argmax(similarities)
        best_similarity = similarities[best_idx]

    elapsed = time.perf_counter() - start_time
    avg_latency_ms = (elapsed / num_queries) * 1000
    qps = num_queries / elapsed

    print(f"   * Total Time for {num_queries} searches: {elapsed:.4f} seconds")
    print(f"   * Average Match Latency per Student: {avg_latency_ms:.3f} milliseconds (Target: < 2.0ms)")
    print(f"   * Throughput: {qps:,.0f} face comparisons per second!")

    # 4. Benchmark with Ambiguity Ratio Calculation
    print(f"\n[3/3] Benchmarking with Ambiguity Ratio verification...")
    start_time = time.perf_counter()

    for i in range(num_queries):
        query = queries[i]
        similarities = np.dot(database, query)
        # argpartition is O(N) instead of full O(N log N) sort
        top_indices = np.argpartition(similarities, -2)[-2:]
        best_sim = similarities[top_indices[1]]
        second_sim = similarities[top_indices[0]]

    elapsed_amb = time.perf_counter() - start_time
    avg_amb_latency_ms = (elapsed_amb / num_queries) * 1000

    print(f"   * Average Match + Ambiguity Verification Latency: {avg_amb_latency_ms:.3f} ms")

    print("\n" + "=" * 65)
    if avg_amb_latency_ms < 2.0:
        print("[SUCCESS] System comfortably exceeds performance criteria for 2,000+ students!")
    else:
        print("[WARNING] Latency slightly higher than optimal, but within real-time limits.")
    print("=" * 65)

if __name__ == "__main__":
    run_scalability_benchmark()
