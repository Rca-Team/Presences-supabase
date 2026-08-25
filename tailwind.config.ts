
import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// iOS-inspired vibrant palette
				cyan: { DEFAULT: 'hsl(var(--cyan))' },
				violet: { DEFAULT: 'hsl(var(--violet))' },
				rose: { DEFAULT: 'hsl(var(--rose))' },
				amber: { DEFAULT: 'hsl(var(--amber))' },
				emerald: { DEFAULT: 'hsl(var(--emerald))' },
				indigo: { DEFAULT: 'hsl(var(--indigo))' },
				teal: { DEFAULT: 'hsl(var(--teal))' },
				fuchsia: { DEFAULT: 'hsl(var(--fuchsia))' },
				// iOS accent colors
				'ios-blue': { DEFAULT: 'hsl(var(--ios-blue))' },
				'ios-green': { DEFAULT: 'hsl(var(--ios-green))' },
				'ios-orange': { DEFAULT: 'hsl(var(--ios-orange))' },
				'ios-pink': { DEFAULT: 'hsl(var(--ios-pink))' },
				'ios-purple': { DEFAULT: 'hsl(var(--ios-purple))' },
				'ios-red': { DEFAULT: 'hsl(var(--ios-red))' },
				'ios-yellow': { DEFAULT: 'hsl(var(--ios-yellow))' },
				'ios-mint': { DEFAULT: 'hsl(var(--ios-mint))' },
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'fade-in': {
					from: { opacity: '0', transform: 'translateY(8px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				'fade-out': {
					from: { opacity: '1', transform: 'translateY(0)' },
					to: { opacity: '0', transform: 'translateY(8px)' }
				},
				'slide-in-up': {
					from: { transform: 'translateY(30px)', opacity: '0' },
					to: { transform: 'translateY(0)', opacity: '1' }
				},
				'slide-in-down': {
					from: { transform: 'translateY(-30px)', opacity: '0' },
					to: { transform: 'translateY(0)', opacity: '1' }
				},
				'slide-in-left': {
					from: { transform: 'translateX(-30px)', opacity: '0' },
					to: { transform: 'translateX(0)', opacity: '1' }
				},
				'slide-in-right': {
					from: { transform: 'translateX(30px)', opacity: '0' },
					to: { transform: 'translateX(0)', opacity: '1' }
				},
				'pulse-subtle': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.7' }
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-12px)' }
				},
				'logo-spin': {
					'0%': { transform: 'rotate(0deg)' },
					'100%': { transform: 'rotate(360deg)' }
				},
				'logo-pulse': {
					'0%, 100%': { opacity: '1', transform: 'scale(1)' },
					'50%': { opacity: '0.85', transform: 'scale(1.08)' }
				},
				'shimmer': {
					'0%': { backgroundPosition: '-200% 0' },
					'100%': { backgroundPosition: '200% 0' }
				},
				// iOS spring animations
				'ios-bounce': {
					'0%': { transform: 'scale(0.9)', opacity: '0' },
					'50%': { transform: 'scale(1.05)' },
					'70%': { transform: 'scale(0.98)' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				'ios-slide-up': {
					'0%': { transform: 'translateY(100%)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				'ios-pop': {
					'0%': { transform: 'scale(0.8)', opacity: '0' },
					'60%': { transform: 'scale(1.08)' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				'ios-wiggle': {
					'0%, 100%': { transform: 'rotate(-2deg)' },
					'50%': { transform: 'rotate(2deg)' }
				},
				'ios-glow': {
					'0%, 100%': { boxShadow: '0 0 20px rgba(0, 122, 255, 0.3)' },
					'50%': { boxShadow: '0 0 40px rgba(0, 122, 255, 0.6)' }
				},
				'smooth-slide': {
					'0%': { transform: 'translateY(10px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				'elastic-scale': {
					'0%': { transform: 'scale(0.9)' },
					'70%': { transform: 'scale(1.05)' },
					'100%': { transform: 'scale(1)' }
				},
				'glow-pulse': {
					'0%, 100%': { boxShadow: '0 0 10px rgba(59, 130, 246, 0.4)' },
					'50%': { boxShadow: '0 0 30px rgba(59, 130, 246, 0.7)' }
				},
				'scale-in': {
					'0%': { transform: 'scale(0.9)', opacity: '0' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				'color-shift': {
					'0%, 100%': { filter: 'hue-rotate(0deg)' },
					'50%': { filter: 'hue-rotate(15deg)' }
				},
				'rainbow-glow': {
					'0%': { boxShadow: '0 0 20px rgba(0, 122, 255, 0.5)' },
					'25%': { boxShadow: '0 0 20px rgba(175, 82, 222, 0.5)' },
					'50%': { boxShadow: '0 0 20px rgba(255, 45, 85, 0.5)' },
					'75%': { boxShadow: '0 0 20px rgba(52, 199, 89, 0.5)' },
					'100%': { boxShadow: '0 0 20px rgba(0, 122, 255, 0.5)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'fade-out': 'fade-out 0.4s ease-out',
				'scale-in': 'scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'slide-in-up': 'slide-in-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'slide-in-down': 'slide-in-down 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'slide-in-left': 'slide-in-left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'slide-in-right': 'slide-in-right 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'pulse-subtle': 'pulse-subtle 2.5s ease-in-out infinite',
				'float': 'float 5s ease-in-out infinite',
				'logo-spin': 'logo-spin 8s linear infinite',
				'logo-pulse': 'logo-pulse 2.5s ease-in-out infinite',
				'shimmer': 'shimmer 2s linear infinite',
				// iOS spring animations
				'ios-bounce': 'ios-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'ios-slide-up': 'ios-slide-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'ios-pop': 'ios-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'ios-wiggle': 'ios-wiggle 0.3s ease-in-out',
				'ios-glow': 'ios-glow 2s ease-in-out infinite',
				'smooth-slide': 'smooth-slide 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'elastic-scale': 'elastic-scale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
				'glow-pulse': 'glow-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
				'color-shift': 'color-shift 4s ease-in-out infinite',
				'rainbow-glow': 'rainbow-glow 4s linear infinite'
			},
			backgroundImage: {
				'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
				'gradient-subtle': 'linear-gradient(to right, var(--gradient-start), var(--gradient-end))',
				'blue-gradient': 'linear-gradient(90deg, hsla(221, 45%, 73%, 1) 0%, hsla(220, 78%, 29%, 1) 100%)',
				'shimmer-gradient': 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0.5) 60%, rgba(255,255,255,0))',
				// iOS-inspired gradients
				'gradient-ios-blue': 'linear-gradient(145deg, hsl(var(--ios-blue)), hsl(var(--ios-purple)))',
				'gradient-ios-green': 'linear-gradient(145deg, hsl(var(--ios-green)), hsl(var(--ios-mint)))',
				'gradient-ios-sunset': 'linear-gradient(145deg, hsl(var(--ios-pink)), hsl(var(--ios-orange)))',
				'gradient-ios-warm': 'linear-gradient(145deg, hsl(var(--ios-orange)), hsl(var(--ios-yellow)))',
				'gradient-ocean': 'linear-gradient(135deg, hsl(var(--cyan)), hsl(var(--ios-blue)))',
				'gradient-sunset': 'linear-gradient(135deg, hsl(var(--ios-pink)), hsl(var(--ios-orange)))',
				'gradient-aurora': 'linear-gradient(135deg, hsl(var(--ios-green)), hsl(var(--ios-mint)), hsl(var(--ios-blue)))',
				'gradient-cosmic': 'linear-gradient(135deg, hsl(var(--ios-purple)), hsl(var(--ios-pink)), hsl(var(--rose)))',
				'gradient-tropical': 'linear-gradient(135deg, hsl(var(--teal)), hsl(var(--ios-green)))',
				'gradient-neon': 'linear-gradient(135deg, hsl(var(--cyan)), hsl(var(--ios-purple)))',
				'gradient-fire': 'linear-gradient(135deg, hsl(var(--ios-orange)), hsl(var(--ios-red)))',
				'gradient-royal': 'linear-gradient(135deg, hsl(var(--indigo)), hsl(var(--ios-purple)))',
				'gradient-rainbow': 'linear-gradient(90deg, hsl(var(--ios-red)), hsl(var(--ios-orange)), hsl(var(--ios-yellow)), hsl(var(--ios-green)), hsl(var(--ios-blue)), hsl(var(--ios-purple)))',
				// iOS gradients
				'iso-blue': 'linear-gradient(135deg, #4171f5 0%, #3451b2 100%)',
				'iso-green': 'linear-gradient(135deg, #36d1dc 0%, #5b86e5 100%)',
				'iso-purple': 'linear-gradient(135deg, #c471ed 0%, #f64f59 100%)'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
