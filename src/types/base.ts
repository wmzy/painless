// key注解： https://tools.ietf.org/html/draft-handrews-json-schema-validation-02

/**
 * @asType integer
 */
export type Integer = number;

/**
 * 正数
 * @minimum 0
 * @exclusiveMinimum true
 */
export type Positive = number;

/**
 * 无符号整数
 * @minimum 0
 */
export type Uint = Integer;

/**
 * ID 类型
 * @minimum 1
 */
export type ID = Integer;
