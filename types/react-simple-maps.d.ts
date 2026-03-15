declare module 'react-simple-maps' {
  import { ComponentType, ReactNode, SVGProps } from 'react'

  export interface ComposableMapProps {
    projection?: string
    projectionConfig?: Record<string, unknown>
    width?: number
    height?: number
    style?: React.CSSProperties
    className?: string
    children?: ReactNode
  }
  export const ComposableMap: ComponentType<ComposableMapProps>

  export interface GeographiesProps {
    geography: string | object
    children: (args: { geographies: Geography[] }) => ReactNode
  }
  export const Geographies: ComponentType<GeographiesProps>

  export interface Geography {
    rsmKey: string
    id: string
    properties: Record<string, string>
    geometry: object
  }

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: Geography
    style?: { default?: object; hover?: object; pressed?: object }
  }
  export const Geography: ComponentType<GeographyProps>

  export interface GraticuleProps extends SVGProps<SVGPathElement> {
    step?: [number, number]
    clipPath?: string
  }
  export const Graticule: ComponentType<GraticuleProps>

  export interface SphereProps extends SVGProps<SVGPathElement> {
    id?: string
    fill?: string
    stroke?: string
    strokeWidth?: number
  }
  export const Sphere: ComponentType<SphereProps>

  export interface MarkerProps {
    coordinates: [number, number]
    children?: ReactNode
  }
  export const Marker: ComponentType<MarkerProps>
}
