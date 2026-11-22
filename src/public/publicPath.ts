/** Patient links (/p/b/:token, /p/r/:token) open the public pages, never the staff app. */
export const isPublicPath = (pathname: string) => pathname.startsWith('/p/');
