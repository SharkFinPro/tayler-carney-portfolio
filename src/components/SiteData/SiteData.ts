import { cmsQuery } from "@/lib/cms";

const SITEDATA_QUERY = `
  query SiteData {
    siteDatas {
      id
      displayName
      focus
      email
      linkedInHandle
      instagramHandle
    }
  }
`;

export default async function getSiteData() {
  const data = await cmsQuery(SITEDATA_QUERY);
  return data.siteDatas[0];
}
