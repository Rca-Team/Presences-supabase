import React from 'react';
import { motion } from 'framer-motion';

interface ScanningAnimationProps {
  isScanning?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const ScanningAnimation: React.FC<ScanningAnimationProps> = ({
  isScanning = true,
  isSuccess = false,
  isError = false,
  size = 'md',
}) => {
  const sizeConfig = {
    sm: { container: 'w-48 h-48', ring: 'w-40 h-40', inner: 'w-32 h-32' },
    md: { container: 'w-72 h-72', ring: 'w-60 h-60', inner: 'w-48 h-48' },
    lg: { container: 'w-96 h-96', ring: 'w-80 h-80', inner: 'w-64 h-64' },
  };

  const config = sizeConfig[size];

  const getColor = () => {
    if (isSuccess) return 'from-green-500 to-emerald-500';
    if (isError) return 'from-red-500 to-rose-500';
    return 'from-cyan-500 to-blue-500';
  };

  const getGlowColor = () => {
    if (isSuccess) return 'shadow-green-500/50';
    if (isError) return 'shadow-red-500/50';
    return 'shadow-cyan-500/50';
  };

  return (
    <div className={`relative ${config.container} flex items-center justify-center`}>
      {/* Outer pulsing rings */}
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full border-2 ${
            isSuccess ? 'border-green-500/30' : isError ? 'border-red-500/30' : 'border-cyan-500/30'
          }`}
          style={{ width: `${70 + i * 15}%`, height: `${70 + i * 15}%` }}
          animate={isScanning ? {
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.6, 0.3],
          } : { scale: 1, opacity: 0.3 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Rotating gradient ring */}
      <motion.div
        className={`absolute ${config.ring} rounded-full`}
        style={{
          background: `conic-gradient(from 0deg, transparent, ${isSuccess ? '#22c55e' : isError ? '#ef4444' : '#06b6d4'}, transparent)`,
        }}
        animate={isScanning ? { rotate: 360 } : { rotate: 0 }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Inner scanning container */}
      <motion.div
        className={`absolute ${config.inner} rounded-full bg-gradient-to-br ${getColor()} p-1`}
        animate={isScanning ? {
          boxShadow: [
            '0 0 20px 5px rgba(6, 182, 212, 0.3)',
            '0 0 40px 10px rgba(6, 182, 212, 0.5)',
            '0 0 20px 5px rgba(6, 182, 212, 0.3)',
          ],
        } : {}}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="w-full h-full rounded-full bg-slate-900/90 flex items-center justify-center overflow-hidden">
          {/* Scanning line animation */}
          {isScanning && (
            <motion.div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              animate={{
                y: [-80, 80],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Center icon/content */}
          <div className="relative z-10">
            {isSuccess ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
              >
                <svg className="w-16 h-16 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  />
                </svg>
              </motion.div>
            ) : isError ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
              >
                <svg className="w-16 h-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M6 18L18 6M6 6l12 12"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  />
                </svg>
              </motion.div>
            ) : (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg className="w-12 h-12 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </motion.div>
            )}
          </div>

          {/* Corner brackets */}
          {isScanning && (
            <>
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-lg" />
            </>
          )}
        </div>
      </motion.div>

      {/* Floating particles */}
      {isScanning && [...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className={`absolute w-2 h-2 rounded-full ${
            isSuccess ? 'bg-green-400' : isError ? 'bg-red-400' : 'bg-cyan-400'
          }`}
          style={{
            left: '50%',
            top: '50%',
          }}
          animate={{
            x: [0, Math.cos(i * 45 * Math.PI / 180) * 100],
            y: [0, Math.sin(i * 45 * Math.PI / 180) * 100],
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Status text */}
      <motion.div
        className="absolute -bottom-8 left-1/2 transform -translate-x-1/2"
        animate={isScanning ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <span className={`text-sm font-medium ${
          isSuccess ? 'text-green-400' : isError ? 'text-red-400' : 'text-cyan-400'
        }`}>
          {isSuccess ? 'Recognized!' : isError ? 'Not Found' : 'Scanning...'}
        </span>
      </motion.div>
    </div>
  );
};

export default ScanningAnimation;
