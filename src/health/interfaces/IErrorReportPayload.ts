/** Payload published on {@link HealthTopicsEnum.ERROR_REPORT} */
export interface IErrorReportPayload {
    readonly serviceName: string;
    readonly error: string;
}
